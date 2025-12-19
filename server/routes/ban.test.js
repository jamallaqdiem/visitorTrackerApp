const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createBanVisitorRouter = require("./ban");

// Global variables for the mock environment
let mockDb;
let app;
let loggerMock;

// --- Database Helper Functions ---
// Promisifies db.run for setup and updates/inserts
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

    // 2. Create the necessary table
    await runDb(mockDb, `CREATE TABLE visitors (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT,
        is_banned INTEGER DEFAULT 0
    )`);

    // 3. Create a mock Express app and inject dependencies
    app = express();
    app.use(express.json());
    // CRITICAL: Pass the loggerMock
    app.use("/", createBanVisitorRouter(mockDb, loggerMock));
});


// Clean up the test database after each test and reset mock call history
afterEach(async () => {
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


describe('POST /ban-visitor/:id', () => {

  // --- Helper to Insert a Test Visitor ---
  const setupVisitor = async (isBanned = 0) => {
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name, is_banned) VALUES (?, ?, ?)`, ['Mark', 'Zebra', isBanned]);
    return visitorResult.lastID;
  };

  // --- Success Tests ---

  test('should successfully ban an unbanned visitor and return 200', async () => {
    const visitorId = await setupVisitor(0); // 0 = not banned

    // 1. Send the request
    const response = await request(app).post(`/ban-visitor/${visitorId}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Visitor has been banned & sign it out.");

    // 2. Verify database state
    const bannedVisitor = await getDb(mockDb, `SELECT is_banned FROM visitors WHERE id = ?`, [visitorId]);
    expect(bannedVisitor.is_banned).toBe(1);

    // 3. Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info.mock.calls[0][0]).toMatch(`Visitor ID ${visitorId} successfully banned.`);
  });

  // --- Failure Tests (404) ---

  test('should return 404 if the visitor ID does not exist', async () => {
    const nonExistentId = 999;
    
    // 1. Send the request
    const response = await request(app).post(`/ban-visitor/${nonExistentId}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Visitor not found.");

    // 2. Verify logging (this covers the case where this.changes === 0)
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(`Ban failed: Visitor ID ${nonExistentId} not found or already banned (404).`);
  });

  test('should return 200 for a redundant ban (visitor is already banned)', async () => {
    const visitorId = await setupVisitor(1); // 1 = already banned

    // 1. Send the request
    const response = await request(app).post(`/ban-visitor/${visitorId}`);

    // The router incorrectly returns 200 if the ban status doesn't change due to this.changes > 0
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Visitor has been banned & sign it out.");

    // 2. Verify database state (should remain 1)
    const bannedVisitor = await getDb(mockDb, `SELECT is_banned FROM visitors WHERE id = ?`, [visitorId]);
    expect(bannedVisitor.is_banned).toBe(1);

    // 3. Verify logging (The router logs INFO because it assumes success)
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info.mock.calls[0][0]).toMatch(`Visitor ID ${visitorId} successfully banned.`);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  // --- Error Tests (500) ---

  test('should return 500 on SQL error during the UPDATE operation', async () => {
    // Mock db.run to simulate an error
    const originalDbRun = mockDb.run;
    mockDb.run = jest.fn(function(sql, params, callback) {
        // Only mock the UPDATE statement
        if (sql.includes('UPDATE visitors SET is_banned')) {
            callback(new Error('Mock UPDATE error'));
        } else {
             // Allow setup queries to run
             originalDbRun.apply(this, [sql, params, callback]);
        }
    });

    // We still need a visitor ID to pass to the route
    const visitorId = 1; 

    const response = await request(app).post(`/ban-visitor/${visitorId}`);

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Mock UPDATE error/);

    // Restore the original function
    mockDb.run = originalDbRun;

    // Verify logging
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatch(/SQL Error banning visitor/);
    expect(loggerMock.info).not.toHaveBeenCalled();
  });
});