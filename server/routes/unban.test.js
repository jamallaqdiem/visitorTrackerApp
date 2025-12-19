const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createUnbanVisitorRouter = require("./unban");

// Define the password used in the .env mock for consistency
const ADMIN_PASSWORD = "test_password"; 

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

// Global variables for the mock environment
let mockDb;
let app;
let loggerMock; 

// --- Test Setup and Teardown ---
beforeAll(async () => {
    // 1. Set the mock environment variable before the router is created
    process.env.MASTER_PASSWORD = ADMIN_PASSWORD; 
    
    mockDb = new sqlite3.Database(':memory:');

    // 2. Initialize the logger mock using Jest's native function
    loggerMock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    // 3. Create tables
    await runDb(mockDb, `CREATE TABLE visitors (
        id INTEGER PRIMARY KEY,
        first_name TEXT,
        is_banned BOOLEAN DEFAULT 0
    )`);

    // 4. Create a mock Express app
    app = express();
    app.use(express.json());
    
    // Pass the mockDb AND the loggerMock to the router
    app.use("/", createUnbanVisitorRouter(mockDb, loggerMock));
});


// Clean up the test database after each test and reset mock call history
afterEach(async () => {
    await runDb(mockDb, `DELETE FROM visitors`);
    // Reset mock history after each test
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

describe('POST /unban-visitor/:id', () => {
  test('should successfully unban a visitor with the correct password and log info', async () => {
    // Insert a sample banned visitor (is_banned = 1)
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, is_banned) VALUES ('Jamal', 1)`);
    const visitorId = visitorResult.lastID;

    const response = await request(app)
      .post(`/unban-visitor/${visitorId}`)
      .send({ password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', `Visitor has been unbanned successfully.`);

    // Verify the visitor's status in the database
    const visitor = await getDb(mockDb, `SELECT is_banned FROM visitors WHERE id = ?`, [visitorId]);
    expect(visitor.is_banned).toBe(0);

    // Verify successful unban was logged as info
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test('should return 403 for an incorrect password and log warning', async () => {
    // Insert a sample banned visitor (needed just to ensure the ID exists)
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, is_banned) VALUES ('Jamal', 1)`);
    const visitorId = visitorResult.lastID;

    const response = await request(app)
      .post(`/unban-visitor/${visitorId}`)
      .send({ password: "wrong_password" });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('message', 'Incorrect password.');

    // Verify failure was logged as a warning
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  test('should return 404 for a non-existent visitor ID and log warning', async () => {
    const nonExistentId = 999;
    const response = await request(app)
      .post(`/unban-visitor/${nonExistentId}`)
      .send({ password: ADMIN_PASSWORD }); 

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Visitor not found.');

    // Verify the 404 failure was logged as a warning
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});