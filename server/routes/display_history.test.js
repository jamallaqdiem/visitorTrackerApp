const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createHistoryRouter = require("./display_history");

// --- Mock Database Setup ---
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
    mockDb.run(`CREATE TABLE visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        photo_path TEXT,
        is_banned BOOLEAN DEFAULT 0
    )`);
    mockDb.run(`CREATE TABLE visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id INTEGER,
        known_as TEXT,
        entry_time TEXT NOT NULL,
        exit_time TEXT,
        address TEXT,
        phone_number TEXT,
        unit TEXT,
        reason_for_visit TEXT,
        company_name TEXT,
        type TEXT,
        mandatory_acknowledgment_taken,
        FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )`);
    mockDb.run(`CREATE TABLE dependents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
        age INTEGER,
        visit_id INTEGER,
        FOREIGN KEY (visit_id) REFERENCES visits(id)
    )`);
});

// Create a mock Express app to test the router
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.protocol = 'http';
    req.get = (header) => (header === 'host' ? 'test:3001' : null);
    next();
});
app.use("/", createHistoryRouter(mockDb));

// --- Helper function to insert test data ---
async function insertTestData() {
    // Visitor 1: Alice Smith (with dependents)
    const v1 = await new Promise((resolve, reject) => {
        mockDb.run(`INSERT INTO visitors (first_name, last_name, is_banned) VALUES ('Alice', 'Smith', 0)`, function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });

    // Visit 1 for Alice (has dependents)
    const visit1 = await new Promise((resolve, reject) => {
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, type, unit) VALUES (?, '2024-05-01T10:00:00Z', 'Personal', 'A101')`, [v1], function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
    await new Promise((resolve, reject) => {
        mockDb.run(`INSERT INTO dependents (full_name, age, visit_id) VALUES ('Kid A', 5, ?), ('Kid B', 8, ?)`, [visit1, visit1], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });

    // Visitor 2: Bob Johnson (banned, no dependents)
    const v2 = await new Promise((resolve, reject) => {
        mockDb.run(`INSERT INTO visitors (first_name, last_name, is_banned) VALUES ('Bob', 'Johnson', 1)`, function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
    // Visit 2 for Bob
    await new Promise((resolve, reject) => {
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, type, unit, exit_time) VALUES (?, '2024-05-02T11:00:00Z', 'Contractor', 'B202', '2024-05-02T12:00:00Z')`, [v2], function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
}

// --- Test Lifecycle Hooks ---
beforeEach(insertTestData); // Insert fresh data before each test

afterEach(async () => {
    // Clean up tables
    await new Promise((resolve) => mockDb.run(`DELETE FROM dependents`, resolve));
    await new Promise((resolve) => mockDb.run(`DELETE FROM visits`, resolve));
    await new Promise((resolve) => mockDb.run(`DELETE FROM visitors`, resolve));
});

afterAll((done) => {
    mockDb.close((err) => {
        if (err) console.error(err.message);
        done();
    });
});

// --- Test Suite ---
describe('GET /history', () => {
    test('should retrieve all history records with correct structure and sorting', async () => {
        const response = await request(app).get('/history');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(2);

        // Check sorting (newest first, based on entry_time)
        expect(response.body[0].first_name).toBe('Bob'); // 2024-05-02
        expect(response.body[1].first_name).toBe('Alice'); // 2024-05-01

        // Check complex JSON dependent parsing on the Alice record (index 1)
        const aliceRecord = response.body.find(r => r.first_name === 'Alice');
        expect(aliceRecord.dependents).toHaveLength(2);
        expect(aliceRecord.dependents).toEqual(expect.arrayContaining([
            { full_name: 'Kid A', age: 5 },
            { full_name: 'Kid B', age: 8 }
        ]));
        
        // Ensure cleanup fields are removed
        expect(aliceRecord.additional_dependents_json).toBeUndefined();
        expect(aliceRecord.photo_path).toBeUndefined();

        // Check basic fields
        expect(aliceRecord.unit).toBe('A101');
        expect(aliceRecord.is_banned).toBe(0);
    });

    test('should filter records by name search query (case-insensitive)', async () => {
        const response = await request(app).get('/history?search=alice');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe('Alice');

        const response2 = await request(app).get('/history?search=JOHNSON');
        expect(response2.status).toBe(200);
        expect(response2.body).toHaveLength(1);
        expect(response2.body[0].first_name).toBe('Bob');
    });

    test('should filter records by date range (start_date)', async () => {
        const response = await request(app).get('/history?start_date=2024-05-02');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe('Bob');
    });

    test('should filter records by date range (end_date)', async () => {
        const response = await request(app).get('/history?end_date=2024-05-01');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].first_name).toBe('Alice');
    });

    test('should return empty array if no records match', async () => {
        const response = await request(app).get('/history?search=nonexistentname');
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(0);
    });
});
