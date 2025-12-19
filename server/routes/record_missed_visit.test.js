const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createMissedVisitRouter = require("./record_missed_visit"); 

// --- Mock Logger Setup (for dependency injection) ---
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// --- Helper Functions ---

/**
 * Generates an ISO 8601 timestamp one hour in the past.
 */
function getPastEntryTime() {
    const now = new Date();
    // Set to 2 hours ago to ensure it is safely in the past
    now.setHours(now.getHours() - 2); 
    return now.toISOString();
}

/**
 * Generates an ISO 8601 timestamp one hour in the future.
 */
function getFutureEntryTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1); 
    return now.toISOString();
}

/**
 * Helper to run async database operations and get lastID.
 */
const runDB = (dbInstance, sql, params = []) => new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function(err) {
        if (err) return reject(err);
        // The 'this' context contains lastID/changes when using a standard function declaration
        resolve(this.lastID);
    });
});

// --- Mock Database Setup ---

// Mock the database in memory for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
    // 1. Visitors table 
    mockDb.run(`CREATE TABLE visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        is_banned BOOLEAN DEFAULT 0
    )`);
    // 2. Visits table (full schema match)
    mockDb.run(`CREATE TABLE visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id INTEGER NOT NULL,
        entry_time TEXT NOT NULL,
        exit_time TEXT,
        known_as TEXT,
        address TEXT,
        phone_number TEXT,
        unit TEXT NOT NULL,
        reason_for_visit TEXT,
        type TEXT NOT NULL,
        company_name TEXT,
        mandatory_acknowledgment_taken TEXT
    )`);
    // 3. Dependents table (included for completeness, though not used in this router)
    mockDb.run(`CREATE TABLE dependents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
        age INTEGER,
        visit_id INTEGER
    )`);
});

// Create a mock Express app to test the router
const app = express();
app.use(express.json()); // Middleware to parse JSON body
// Pass the mockDb and the mockLogger to the router factory function
app.use("/", createMissedVisitRouter(mockDb, mockLogger)); 

// --- Test Setup and Teardown ---

let testVisitorId;
// Sample data matching the required NOT NULL fields
const sampleVisitDetails = {
    known_as: 'miky',
    address: '700 london road Portsmouth Po70 3as',
    unit: '101A',
    phone_number: '555-1212',
    type: 'Guest',
    reason_for_visit: 'Meeting',
    mandatory_acknowledgment_taken: 'text'
};

beforeEach(async () => {
    // 1. Insert a visitor
    testVisitorId = await runDB(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES (?, ?)`, ['Test', 'Visitor']);
    
    // 2. Insert a valid, complete previous visit record.
    await runDB(mockDb, `
        INSERT INTO visits (visitor_id, entry_time, exit_time, known_as, address, phone_number, unit, reason_for_visit, type, mandatory_acknowledgment_taken) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [
            testVisitorId, 
            new Date(Date.now() - 3600000).toISOString(), // Entry: 1 hour ago
            new Date(Date.now() - 1800000).toISOString(), // Exit: 30 minutes ago
            sampleVisitDetails.known_as,
            sampleVisitDetails.address,
            sampleVisitDetails.phone_number,
            sampleVisitDetails.unit,
            sampleVisitDetails.reason_for_visit,
            sampleVisitDetails.type,
            sampleVisitDetails.mandatory_acknowledgment_taken
        ]);
});

afterEach(async () => {
    // Clear mock call history for logger
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();

    // Clean up all tables
    await new Promise((resolve, reject) => {
        // Use DELETE FROM without WHERE clause to quickly empty tables
        mockDb.run(`DELETE FROM dependents`, (err) => {
            if (err) return reject(err);
            mockDb.run(`DELETE FROM visits`, (err) => {
                if (err) return reject(err);
                mockDb.run(`DELETE FROM visitors`, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
    });
});

afterAll((done) => {
    mockDb.close((err) => {
        if (err) console.error(err.message);
        done();
    });
});

// --- Test Suite ---

describe('POST /record-missed-visit', () => {
    const API_ENDPOINT = '/record-missed-visit';

    test('should successfully record a missed visit with a past time and return 200', async () => {
        const pastTime = getPastEntryTime();
        
        const response = await request(app)
            .post(API_ENDPOINT)
            .send({ 
                visitorId: testVisitorId, 
                pastEntryTime: pastTime 
            });

        // 1. Check HTTP Status
        expect(response.status).toBe(200);
        
        // 2. Check response message
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toMatch("Visitor Entry Time Corrected & Sing it Out");
        expect(mockLogger.info).toHaveBeenCalled();

        // 3. Verify database insertion
        const dbResult = await new Promise((resolve, reject) => {
            // Check for the newly created visit
            mockDb.all(`SELECT entry_time, exit_time, unit, type FROM visits WHERE visitor_id = ? ORDER BY entry_time DESC`, [testVisitorId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
        
        // Expect two rows (the setup visit + the new missed visit)
        expect(dbResult.length).toBe(2);
        
        // Check the newest row (the missed visit)
        const newestVisit = dbResult[0];
        // Ensure the unit and type were correctly copied from the previous visit
        expect(newestVisit.unit).toBe(sampleVisitDetails.unit);
        expect(newestVisit.type).toBe(sampleVisitDetails.type);
    });

    test('should return 400 if visitor ID is missing', async () => {
        const response = await request(app)
            .post(API_ENDPOINT)
            .send({ pastEntryTime: getPastEntryTime() }); // Missing visitorId

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message', 'Missing visitor ID or required entry time.');
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should return 400 if entry time is missing', async () => {
        const response = await request(app)
            .post(API_ENDPOINT)
            .send({ visitorId: testVisitorId }); // Missing pastEntryTime

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message', 'Missing visitor ID or required entry time.');
        expect(mockLogger.warn).toHaveBeenCalled();
    });
    
    test('should return 400 if entry time is in the future', async () => {
        const futureTime = getFutureEntryTime();

        const response = await request(app)
            .post(API_ENDPOINT)
            .send({ 
                visitorId: testVisitorId, 
                pastEntryTime: futureTime 
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid entry time. It must be a valid date/time and occur before the current exit time.');
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    //  a test to ensure default values are used if no previous visit exists
    test('should use default values if no previous visit is found for the visitor', async () => {
        // Insert a NEW visitor ID with no prior visits in the DB
        const freshVisitorId = await runDB(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES (?, ?)`, ['Fresh', 'Visitor']);
        const pastTime = getPastEntryTime();
        
        const response = await request(app)
            .post(API_ENDPOINT)
            .send({ 
                visitorId: freshVisitorId, 
                pastEntryTime: pastTime 
            });

        expect(response.status).toBe(200);

        // Verify database insertion and check for default values
        const dbResult = await new Promise((resolve, reject) => {
            mockDb.get(`SELECT known_as, type FROM visits WHERE visitor_id = ?`, [freshVisitorId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
        expect(dbResult.type).toBe('Visitor'); 
    });
});