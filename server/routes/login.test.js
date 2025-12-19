const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createLoginRouter = require("./login");

// Global variables for the mock environment
let mockDb;
let app;
let loggerMock;

// --- Database Helper Functions ---
const runDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

const getDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

const allDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
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
        last_name TEXT,
        is_banned INTEGER DEFAULT 0
    )`);
    await runDb(mockDb, `CREATE TABLE visits (
        id INTEGER PRIMARY KEY,
        visitor_id INTEGER NOT NULL,
        entry_time TEXT NOT NULL,
        exit_time TEXT,
        known_as TEXT,
        address TEXT,
        phone_number TEXT,
        unit TEXT,
        reason_for_visit TEXT,
        type TEXT,
        company_name TEXT,
        mandatory_acknowledgment_taken TEXT,
        FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )`);
    await runDb(mockDb, `CREATE TABLE dependents (
        id INTEGER PRIMARY KEY,
        visit_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        age INTEGER,
        FOREIGN KEY (visit_id) REFERENCES visits(id)
    )`);

    // 3. Create a mock Express app and inject dependencies
    app = express();
    app.use(express.json());
    app.use("/", createLoginRouter(mockDb, loggerMock));
});


// Clean up the test database after each test and reset mock call history
afterEach(async () => {
    await runDb(mockDb, `DELETE FROM dependents`);
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

describe('POST /login', () => {

  // Mock the Date object to control the "entry time" for consistency
  const mockEntryDate = new Date('2025-11-02T09:30:00.000Z'); 
  const mockEntryTime = mockEntryDate.toISOString();
  
  beforeAll(() => {
    jest.spyOn(global, 'Date').mockImplementation(() => mockEntryDate);
  });

  afterAll(() => {
    jest.spyOn(global, 'Date').mockRestore();
  });

  // --- Helper to Insert a Test Visitor and Visit ---
  const setupVisitorWithHistory = async (isBanned = 0) => {
    // 1. Create Visitor
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name, is_banned) VALUES ('John', 'Smith', ?)`, [isBanned]);
    const visitorId = visitorResult.lastID;

    // 2. Insert Old Visit (to ensure the latest one is picked)
    await runDb(mockDb, `
      INSERT INTO visits (visitor_id, entry_time, known_as, address, type) 
      VALUES (?, ?, ?, ?, ?)`, 
      [visitorId, '2025-01-01T10:00:00.000Z', 'Old Known', 'Old Address', 'Delivery']);

    // 3. Insert Latest Visit with full details and dependents (this data should be inherited)
    const latestVisitResult = await runDb(mockDb, `
      INSERT INTO visits (visitor_id, entry_time, known_as, address, phone_number, unit, reason_for_visit, type, company_name, mandatory_acknowledgment_taken) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [visitorId, '2025-10-30T10:00:00.000Z', 'John Smith', '123 Main St', '555-1234', 'A101', 'Meeting', 'Guest', 'Google', 'Yes']);
    const latestVisitId = latestVisitResult.lastID;

    // 4. Insert Dependents for the latest visit
    await runDb(mockDb, `INSERT INTO dependents (visit_id, full_name, age) VALUES (?, ?, ?)`, 
      [latestVisitId, 'Kid One', 8]);
    await runDb(mockDb, `INSERT INTO dependents (visit_id, full_name, age) VALUES (?, ?, ?)`, 
      [latestVisitId, 'Kid Two', 5]);

    return { visitorId, latestVisitId };
  };

  // --- Success Tests ---

  test('should successfully log in a visitor, inheriting details and dependents from the last visit', async () => {
    const { visitorId } = await setupVisitorWithHistory();

    // 1. Send the request
    const response = await request(app)
      .post('/login')
      .send({ id: visitorId });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Visitor signed in successfully!");
    
    const vData = response.body.visitorData;

    // 2. Verify response data structure and inherited fields
    expect(vData.id).toBe(visitorId);
    expect(vData.known_as).toBe('John Smith');
    expect(vData.type).toBe('Guest');
    expect(vData.dependents).toHaveLength(2);
    expect(vData.dependents[0].full_name).toBe('Kid One');
    
    // 3. Verify database state (New Visit Inserted)
    const newVisits = await allDb(mockDb, `SELECT * FROM visits WHERE visitor_id = ? ORDER BY entry_time DESC`, [visitorId]);
    expect(newVisits).toHaveLength(3); // Old, Latest (Inherited), New
    
    const newVisitRecord = newVisits[0];
    expect(newVisitRecord.entry_time).toBe(mockEntryTime);
    expect(newVisitRecord.known_as).toBe('John Smith'); // Should be inherited
    
    const newVisitId = newVisitRecord.id;

    // 4. Verify dependents were copied to the new visit ID
    const newDependents = await allDb(mockDb, `SELECT full_name, age FROM dependents WHERE visit_id = ?`, [newVisitId]);
    expect(newDependents).toHaveLength(2);
    expect(newDependents.map(d => d.full_name)).toEqual(['Kid One', 'Kid Two']);

    // 5. Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info.mock.calls[0][0]).toMatch(`SUCCESS: Visitor ID ${visitorId} signed in successfully. New Visit ID: ${newVisitId}.`);
  });

  test('should successfully log in a visitor with no previous visit history (using nulls/defaults)', async () => {
    // 1. Create a brand new visitor with no visits or dependents
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('New', 'Guest')`);
    const visitorId = visitorResult.lastID;

    // 2. Send the request
    const response = await request(app)
      .post('/login')
      .send({ id: visitorId });

    expect(response.status).toBe(200);
    
    const vData = response.body.visitorData;

    // 3. Verify response data uses defaults (null or '--')
    expect(vData.known_as).toBeNull(); // known_as should be null/undefined since it comes from visits
    expect(vData.unit).toBeNull();
    expect(vData.dependents).toHaveLength(0);

    // 4. Verify database state (New Visit Inserted with nulls)
    const newVisitRecord = await getDb(mockDb, `SELECT known_as, entry_time FROM visits WHERE visitor_id = ?`, [visitorId]);
    expect(newVisitRecord.entry_time).toBe(mockEntryTime);
    expect(newVisitRecord.known_as).toBeNull(); // Should be inserted as null
    
    // 5. Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
  });

  // --- Failure Tests (400, 403, 404) ---

  test('should return 400 if visitor ID is missing and log warn', async () => {
    const response = await request(app)
      .post('/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Visitor ID is required for login." });
    
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(/Missing visitor ID/);
  });
  
  test('should return 404 if visitor ID does not exist and log warn', async () => {
    const nonExistentId = 999;
    const response = await request(app)
      .post('/login')
      .send({ id: nonExistentId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Visitor not found." });
    
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(`Login failed for ID ${nonExistentId}: Visitor not found (404).`);
  });
  
  test('should return 403 if the visitor is banned (is_banned = 1) and log warn', async () => {
    const { visitorId } = await setupVisitorWithHistory(1); // 1 = Banned

    const response = await request(app)
      .post('/login')
      .send({ id: visitorId });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: "This visitor is banned and cannot log in." });
    
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(`Login attempt by banned visitor ID ${visitorId} blocked (403 Forbidden).`);
    expect(loggerMock.info).not.toHaveBeenCalled(); // Ensure no sign-in occurs
  });

  // --- Error Tests (500) ---

  test('should return 500 on SQL error during the initial SELECT lookup', async () => {
    // Mock db.get to simulate an error during the lookup
    const originalDbGet = mockDb.get;
    mockDb.get = jest.fn((sql, params, callback) => {
        // Only mock the SELECT statement (which has GROUP_CONCAT)
        if (sql.includes('GROUP_CONCAT')) {
            callback(new Error('Mock SELECT error'), null);
        } else {
             originalDbGet.apply(this, [sql, params, callback]);
        }
    });

    const response = await request(app).post(`/login`).send({ id: 1 });

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Mock SELECT error/);

    // Restore the original function
    mockDb.get = originalDbGet;
    
    // Verify logging
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatch(/SQL Error in login/);
  });

  test('should return 500 on SQL error during the main INSERT into visits', async () => {
    // 1. Setup active visitor (db.get will succeed)
    const { visitorId } = await setupVisitorWithHistory();

    // 2. Mock db.run to simulate an error during the visit INSERT
    const originalDbRun = mockDb.run;
    mockDb.run = jest.fn(function(sql, params, callback) {
        // Only mock the INSERT statement into visits
        if (sql.includes('INSERT INTO visits')) {
            callback(new Error('Mock VISIT INSERT error'));
        } else {
             // Let other queries pass (like dependent insertion)
             originalDbRun.apply(this, [sql, params, callback]);
        }
    });

    const response = await request(app).post(`/login`).send({ id: visitorId });

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Mock VISIT INSERT error/);

    // Restore the original function
    mockDb.run = originalDbRun;

    // Verify logging
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatch(/SQL Error inserting new visit/);
    expect(loggerMock.info).not.toHaveBeenCalled();
  });
});