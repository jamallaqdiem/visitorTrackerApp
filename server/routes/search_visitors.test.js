const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createSearchVisitorsRouter = require("./search_visitors");

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

// Promisifies db.all for verification
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
        last_name TEXT NOT NULL,
        photo_path TEXT,
        is_banned INTEGER DEFAULT 0
    )`);
    await runDb(mockDb, `CREATE TABLE visits (
        id INTEGER PRIMARY KEY,
        visitor_id INTEGER NOT NULL,
        entry_time TEXT NOT NULL,
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

    // 3. Create a mock Express app and inject dependencies
    app = express();
    app.use(express.json());
    //Pass the loggerMock
    app.use("/", createSearchVisitorsRouter(mockDb, loggerMock));
});


// Clean up the test database after each test and reset mock call history
afterEach(async () => {
    await runDb(mockDb, `DELETE FROM dependents`);
    await runDb(mockDb, `DELETE FROM visits`);
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

describe('GET /visitor-search', () => {
  
  // --- Test Case 1: Missing Search Term ---
  test('should return 400 if no search term is provided and log warn', async () => {
    const response = await request(app).get('/visitor-search');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Search term 'name' is required." });
    
    // Verify logging
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(/Search attempted without a 'name' search term/);
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  // --- Test Case 2: No Results Found ---
  test('should return an empty array if no matches are found and log info', async () => {
    // Insert a test visitor that won't match the search term
    await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Test', 'User')`);

    const searchTerm = 'NonExistentName';
    const response = await request(app).get(`/visitor-search?name=${searchTerm}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    
    // Verify logging (start and finish)
    expect(loggerMock.info).toHaveBeenCalledTimes(2);
    expect(loggerMock.info.mock.calls[0][0]).toMatch(`Starting visitor search for term: "${searchTerm}"`);
    expect(loggerMock.info.mock.calls[1][0]).toMatch(`Search for "${searchTerm}" completed successfully, found 0 results.`);
  });

  // --- Test Case 3: Basic Search by Name (Single Term) ---
  test('should find a visitor by first or last name (single term search)', async () => {
    // Insert data
    await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Alice', 'Smith')`);
    const searchTerm = 'Smith';
    
    const response = await request(app).get(`/visitor-search?name=${searchTerm}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].first_name).toBe('Alice');
    
    // Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(2);
    expect(loggerMock.info.mock.calls[1][0]).toMatch(`Search for "${searchTerm}" completed successfully, found 1 results.`);
  });

  // --- Test Case 4: Multi-word Search (AND condition) ---
  test('should find a visitor using multi-word search (first AND last name match)', async () => {
    // Insert data
    await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Bob', 'Johnson')`);
    const searchTerm = 'Bob John'; // This should match (Bob LIKE %Bob%) AND (Johnson LIKE %John%)
    
    const response = await request(app).get(`/visitor-search?name=${searchTerm}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].first_name).toBe('Bob');
  });

  // --- Test Case 5: Retrieving Most Recent Visit Data (ROW_NUMBER logic) ---
  test('should retrieve details from the MOST RECENT visit record', async () => {
    // 1. Insert Visitor
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Recent', 'Tester')`);
    const visitorId = visitorResult.lastID;

    // 2. Insert OLD visit record
    await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, known_as) VALUES (?, ?, ?)`, 
      [visitorId, '2023-01-01T10:00:00Z', 'Old Name']);

    // 3. Insert NEW visit record (should be retrieved by the query)
    await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, known_as) VALUES (?, ?, ?)`, 
      [visitorId, '2023-11-01T10:00:00Z', 'Current Name']);

    const searchTerm = 'Recent Tester';
    const response = await request(app).get(`/visitor-search?name=${searchTerm}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    // CRITICAL: Check that the known_as field is from the newer visit
    expect(response.body[0].known_as).toBe('Current Name');
  });

  // --- Test Case 6: Dependent JSON Parsing and Attachment ---
  test('should correctly parse and attach dependent data', async () => {
    // 1. Insert Visitor
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Parent', 'Visitor')`);
    const visitorId = visitorResult.lastID;

    // 2. Insert Visit
    const visitResult = await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time) VALUES (?, ?)`, 
      [visitorId, '2023-11-01T10:00:00Z']);
    const visitId = visitResult.lastID;

    // 3. Insert Dependents
    await runDb(mockDb, `INSERT INTO dependents (full_name, age, visit_id) VALUES (?, ?, ?)`, ['Kid A', 5, visitId]);
    await runDb(mockDb, `INSERT INTO dependents (full_name, age, visit_id) VALUES (?, ?, ?)`, ['Kid B', 8, visitId]);

    const searchTerm = 'Parent';
    const response = await request(app).get(`/visitor-search?name=${searchTerm}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    
    // Check dependents array
    const visitor = response.body[0];
    expect(visitor).toHaveProperty('dependents');
    expect(visitor.dependents).toHaveLength(2);
    expect(visitor.dependents.map(d => d.full_name)).toEqual(expect.arrayContaining(['Kid A', 'Kid B']));

    // Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(2);
  });
});