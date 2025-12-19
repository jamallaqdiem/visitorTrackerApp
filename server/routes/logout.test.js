const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createLogoutRouter = require("./logout");

// Global variables for the mock environment
let mockDb;
let app;
let loggerMock; // Jest mock object

// --- Database Helper Functions ---
// Promisifies db.run for setup and inserts
const runDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

// Promisifies db.get for verification
const getDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

// --- Test Setup and Teardown ---
beforeAll(async () => {
    mockDb = new sqlite3.Database(':memory:');

    // 1. Initialize the logger mock
    loggerMock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    // 2. Create tables
    await runDb(mockDb, `CREATE TABLE visitors (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT
    )`);
    await runDb(mockDb, `CREATE TABLE visits (
        id INTEGER PRIMARY KEY,
        visitor_id INTEGER NOT NULL,
        entry_time TEXT NOT NULL,
        exit_time TEXT,
        FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )`);

    // 3. Create a mock Express app and inject dependencies
    app = express();
    app.use(express.json());
    // Pass the loggerMock
    app.use("/", createLogoutRouter(mockDb, loggerMock));
});


// Clean up the test database after each test and reset mock call history
afterEach(async () => {
    await runDb(mockDb, `DELETE FROM visits`);
    await runDb(mockDb, `DELETE FROM visitors`);
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
});

// Close the database connection after all tests
afterAll((done) => {
  mockDb.close((err) => {
    if (err) console.error(err.message);
    done();
  });
});

describe('POST /exit-visitor/:id', () => {

  // Mock the Date object to control the "exit time" for consistency
  const mockExitDate = new Date('2025-11-01T15:00:00.000Z'); 
  const mockExitTime = mockExitDate.toISOString();
  
  beforeAll(() => {
    jest.spyOn(global, 'Date').mockImplementation(() => mockExitDate);
  });

  afterAll(() => {
    jest.spyOn(global, 'Date').mockRestore();
  });

  // --- Helper to Insert a Test Visitor and Visit ---
  const setupVisitorAndVisit = async (firstName, lastName, exitTime = null, entryTime = '2025-11-01T10:00:00.000Z') => {
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES (?, ?)`, [firstName, lastName]);
    const visitorId = visitorResult.lastID;
    const visitResult = await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, [visitorId, entryTime, exitTime]);
    const visitId = visitResult.lastID;
    return { visitorId, visitId, fullName: `${firstName} ${lastName}` };
  };

  // --- Success Tests ---

  test('should successfully log out the most recent active visit and return 200', async () => {
    // 1. Setup Visitor and multiple visits
    const { visitorId, fullName } = await setupVisitorAndVisit('John', 'Doe');
    
    // Insert an earlier, closed visit
    await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, 
      [visitorId, '2025-10-31T09:00:00.000Z', '2025-10-31T11:00:00.000Z']);

    // Insert the active visit (most recent one to be logged out)
    const activeVisitResult = await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, 
      [visitorId, '2025-11-01T14:00:00.000Z', null]);
    const activeVisitId = activeVisitResult.lastID;


    // 2. Send the request
    const response = await request(app).post(`/exit-visitor/${visitorId}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(`${fullName} has been successfully signed out.`);

    // 3. Verify database state
    const updatedVisit = await getDb(mockDb, `SELECT exit_time FROM visits WHERE id = ?`, [activeVisitId]);
    expect(updatedVisit.exit_time).toBe(mockExitTime);

    // 4. Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info.mock.calls[0][0]).toMatch(`SUCCESS: Visitor ${fullName} (ID ${visitorId}) signed out Visit ID ${activeVisitId}.`);
  });

  // --- Failure Tests (404) ---

  test('should return 404 if the visitor is already signed out (no active visits)', async () => {
    // 1. Setup Visitor with a closed visit
    const { visitorId } = await setupVisitorAndVisit('Jane', 'Smith', '2025-11-01T11:00:00.000Z');
    
    // 2. Send the request
    const response = await request(app).post(`/exit-visitor/${visitorId}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Visitor not found or already signed out.");
    
    // 3. Verify logging
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(`Sign-out failed for ID ${visitorId}: No active visit found (404).`);
  });

  test('should return 404 if the visitor ID does not exist', async () => {
    const nonExistentId = 999;
    
    const response = await request(app).post(`/exit-visitor/${nonExistentId}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Visitor not found or already signed out.");

    // The router logic relies on the join query returning null, which results in the 404 path.
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(`Sign-out failed for ID ${nonExistentId}: No active visit found (404).`);
  });

  // --- Error Tests (500) ---

  test('should return 500 on SQL error during the SELECT lookup', async () => {
    // Mock db.get to simulate an error during the lookup
    const originalDbGet = mockDb.get;
    mockDb.get = jest.fn((sql, params, callback) => {
        // Only mock the SELECT statement (which finds the active visit)
        if (sql.includes('SELECT T1.id AS visit_id')) {
            callback(new Error('Mock SELECT error'), null);
        } else {
             // Let other queries pass (like visitor setup in afterEach)
             originalDbGet.apply(this, [sql, params, callback]);
        }
    });

    const response = await request(app).post(`/exit-visitor/1`);

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Mock SELECT error/);

    // Restore the original function
    mockDb.get = originalDbGet;
    
    // Verify logging
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatch(/SQL Error in exit-visitor/);
  });

  test('should return 500 on SQL error during the UPDATE', async () => {
    // 1. Setup active visitor (db.get will succeed)
    const { visitorId } = await setupVisitorAndVisit('Alice', 'Green');

    // 2. Mock db.run to simulate an error during the update
    const originalDbRun = mockDb.run;
    mockDb.run = jest.fn(function(sql, params, callback) {
        // Only mock the UPDATE statement
        if (sql.includes('UPDATE visits SET exit_time')) {
            callback(new Error('Mock UPDATE error'));
        } else {
             // Let other queries pass (like visitor setup in afterEach)
             originalDbRun.apply(this, [sql, params, callback]);
        }
    });

    const response = await request(app).post(`/exit-visitor/${visitorId}`);

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Mock UPDATE error/);

    // Restore the original function
    mockDb.run = originalDbRun;

    // Verify logging
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatch(/SQL Error in exit-visitor/);
    expect(loggerMock.info).not.toHaveBeenCalled();
  });
});