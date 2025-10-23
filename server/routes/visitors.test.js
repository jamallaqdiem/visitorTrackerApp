const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createVisitorsRouter = require("./visitors");

// Global variables for the mock environment
let mockDb;
let app;

// Helper function to promisify db.run
const runDb = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        mockDb.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

// Setup: Create the database and initialize the app before any tests run
beforeAll(async () => {
    mockDb = new sqlite3.Database(":memory:");

    await runDb(`CREATE TABLE visitors (
        id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        photo_path TEXT,
        is_banned INTEGER DEFAULT 0
    )`);
    await runDb(`CREATE TABLE visits (
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
    await runDb(`CREATE TABLE dependents (
        id INTEGER PRIMARY KEY,
        visit_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        age INTEGER,
        FOREIGN KEY (visit_id) REFERENCES visits(id)
    )`);

    // 2. Initialize the Express app and router
    app = express();
    app.use(express.json()); 
    app.use("/", createVisitorsRouter(mockDb));
});

// Clean up the test database after each test
afterEach(async () => {
    await runDb("DELETE FROM dependents");
    await runDb("DELETE FROM visits");
    await runDb("DELETE FROM visitors");
});

// Close the database connection after all tests
afterAll((done) => {
    mockDb.close((err) => {
        if (err) console.error(err.message);
        done();
    });
});

describe("GET /visitors", () => {
    test("should return an empty array if no visitors are signed in", async () => {
        const response = await request(app).get("/visitors");
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test("should return only currently signed-in visitors", async () => {
        // Insert a signed-in visitor
        const result = await runDb(`INSERT INTO visitors (first_name, last_name) VALUES ('Jane', 'Doe')`);
        const visitorId = result.lastID;
        await runDb(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, new Date().toISOString()]);

        // Make the request and verify the response
        const response = await request(app).get("/visitors");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe("Jane");
    });

    test("should only return visitors with a NULL exit_time", async () => {
        // Insert a signed-in visitor
        let result = await runDb(`INSERT INTO visitors (first_name, last_name) VALUES ('Jane', 'Doe')`);
        let visitorId = result.lastID;
        await runDb(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, new Date().toISOString()]);

        // Insert a signed-out visitor
        result = await runDb(`INSERT INTO visitors (first_name, last_name) VALUES ('John', 'Smith')`);
        visitorId = result.lastID;
        await runDb(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, [visitorId, new Date().toISOString(), new Date().toISOString()]);

        // Make the request and verify the response
        const response = await request(app).get("/visitors");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe("Jane");
    });

    test("should return visitors sorted by entry_time in descending order", async () => {
        // Insert an earlier visitor
        let result = await runDb(`INSERT INTO visitors (first_name, last_name) VALUES ('Early', 'Bird')`);
        let visitorId = result.lastID;
        await runDb(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T10:00:00Z"]);

        // Insert a later visitor
        result = await runDb(`INSERT INTO visitors (first_name, last_name) VALUES ('Late', 'Comer')`);
        visitorId = result.lastID;
        await runDb(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T11:00:00Z"]);

        // Make the request and verify the order
        const response = await request(app).get("/visitors");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);
        expect(response.body[0].first_name).toBe("Late");
        expect(response.body[1].first_name).toBe("Early");
    });
});
