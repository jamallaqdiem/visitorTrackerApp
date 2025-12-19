const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createVisitorsRouter = require("./visitors");

// Global variables for the mock environment
let mockDb;
let app;
let loggerMock; // Jest mock object

// Helper function to promisify db.run
const runDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

// Setup: Create the database and initialize the app before any tests run
beforeAll(async () => {
    mockDb = new sqlite3.Database(":memory:");

    // 1. Initialize the logger mock using Jest's native function
    loggerMock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    // 2. Create tables
    await runDb(mockDb, `CREATE TABLE visitors (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        photo_path TEXT,
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
        company_name TEXT,
        type TEXT,
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

    // 3. Initialize the Express app and router
    app = express();
    app.use(express.json()); 
    // Pass the mockDb AND the loggerMock to the router
    app.use("/", createVisitorsRouter(mockDb, loggerMock));
});

// Clean up the test database after each test and reset mock call history
afterEach(async () => {
    await runDb(mockDb, "DELETE FROM dependents");
    await runDb(mockDb, "DELETE FROM visits");
    await runDb(mockDb, "DELETE FROM visitors");
    // Reset mock history after each test
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    loggerMock.debug.mockClear()
});

// Close the database connection after all tests
afterAll((done) => {
    mockDb.close((err) => {
        if (err) console.error(err.message);
        done();
    });
});

describe("GET /visitors", () => {
    test("should return an empty array if no visitors are signed in and log debug", async () => {
        const response = await request(app).get("/visitors");
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
        
        // Verify logging: Successful empty query now uses DEBUG
        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
        expect(loggerMock.debug.mock.calls[0][0]).toMatch(/Fetched 0 currently signed-in visitors./);
        expect(loggerMock.info).not.toHaveBeenCalled(); // Ensure info was not called
    });

    test("should return only currently signed-in visitors and log debug", async () => {
        // Insert a signed-in visitor
        const result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Jane', 'Doe')`);
        const visitorId = result.lastID;
        await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, new Date().toISOString()]);

        // Make the request and verify the response
        const response = await request(app).get("/visitors");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe("Jane");
        
        // Verify logging: Successful fetch of 1 visitor now uses DEBUG
        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
        expect(loggerMock.debug.mock.calls[0][0]).toMatch(/Fetched 1 currently signed-in visitors./);
        expect(loggerMock.info).not.toHaveBeenCalled();
    });

    test("should only return visitors with a NULL exit_time", async () => {
        // Insert a signed-in visitor
        let result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Jane', 'Doe')`);
        let visitorId = result.lastID;
        await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T10:00:00Z"]);

        // Insert a signed-out visitor
        result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('John', 'Smith')`);
        visitorId = result.lastID;
        await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, [visitorId, "2023-01-01T09:00:00Z", new Date().toISOString()]);

        // Make the request and verify the response
        const response = await request(app).get("/visitors");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe("Jane");

        // The assertion in this test still needs to be corrected to use debug
        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
    });

    test("should return visitors sorted by entry_time in descending order", async () => {
        // Insert an earlier visitor
        let result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Early', 'Bird')`);
        let visitorId = result.lastID;
        await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T10:00:00Z"]);

        // Insert a later visitor
        result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Late', 'Comer')`);
        visitorId = result.lastID;
        await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T11:00:00Z"]);

        // Make the request and verify the order
        const response = await request(app).get("/visitors");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
        expect(response.body[0].first_name).toBe("Late");
        expect(response.body[1].first_name).toBe("Early");
        
        // Check log count remains 1 for successful fetch, now using DEBUG
        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
        expect(loggerMock.debug.mock.calls[0][0]).toMatch(/Fetched 2 currently signed-in visitors./);
        expect(loggerMock.info).not.toHaveBeenCalled();
    });
});