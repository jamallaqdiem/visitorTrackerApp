const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createAuditRouter = require("./audit_logs"); 

// Global variables for the mock environment
let mockDb;
let app;
let loggerMock; // Added loggerMock

// Helper function to promisify db.run
const runDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

// Setup
beforeAll(async () => {
    mockDb = new sqlite3.Database(":memory:");
    
    // Initialize the logger mock
    loggerMock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    // Create the required table
    await runDb(mockDb, `
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY,
            event_name TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL,
            profiles_deleted INTEGER,
            visits_deleted INTEGER,
            dependents_deleted INTEGER
        )
    `);

    // Initialize the Express app and router
    app = express();
    app.use(express.json()); 
    // Pass the mockDb AND the loggerMock to the router
    app.use("/api/audit", createAuditRouter(mockDb, loggerMock)); 
});

// Clean up
afterEach(async () => {
    await runDb(mockDb, "DELETE FROM audit_logs");
    loggerMock.info.mockClear();
    loggerMock.error.mockClear();
});

afterAll((done) => {
    mockDb.close((err) => {
        if (err) console.error(err.message);
        done();
    });
});

describe("Audit Log Endpoint Integration Test", () => {
    const testErrorData = {
        event_name: "Client Log Error", 
        timestamp: new Date().toISOString(),
        client_message: "Simulated client-side error in React component.",
        client_stack: "Error: Simulated client-side error\n    at function (file.js:1:1)",
        status: "ERROR",
    };

    test("POST /api/audit/log-error should insert a new entry into audit_logs table", async () => {
        // 1. Ensure the table is empty
        let logs = await new Promise((resolve, reject) => {
            mockDb.all("SELECT * FROM audit_logs", (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        expect(logs).toHaveLength(0);

        // 2. Perform the POST request
        const response = await request(app)
            .post('/api/audit/log-error')
            .send(testErrorData)
            .expect('Content-Type', /json/) 
            .expect(201); 

        // 3. Verify the response body uses expect.any(Number) for the ID
        expect(response.body).toEqual({ 
            message: "Client error logged successfully",
            id: expect.any(Number) 
        });

        // 4. Verify the database content
        logs = await new Promise((resolve, reject) => {
            mockDb.all("SELECT * FROM audit_logs", (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        expect(logs).toHaveLength(1);
        // Assert against testErrorData.event_name 
        expect(logs[0].event_name).toBe(testErrorData.event_name); 
        expect(logs[0].status).toBe(testErrorData.status); 
        
        // On success (201), the server logs INFO. check for the INFO call.
        expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully recorded client error: ${testErrorData.event_name}`));

        // We also ensure that the error logger was NOT called, as the operation was successful.
        expect(loggerMock.error).not.toHaveBeenCalled();
    });
});