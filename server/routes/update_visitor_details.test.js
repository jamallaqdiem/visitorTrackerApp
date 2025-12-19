const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createUpdateVisitorRouter = require("./update_visitor_details");

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
        first_name TEXT NOT NULL
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
    app.use("/", createUpdateVisitorRouter(mockDb, loggerMock));
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

describe('POST /update-visitor-details', () => {

  // Sample data for a successful update
  const sampleUpdateData = {
    known_as: "Jane D.",
    address: "123 Main St",
    phone_number: "555-1234",
    unit: "A101",
    reason_for_visit: "Delivery",
    type: "Personal",
    company_name: "N/A",
    mandatory_acknowledgment_taken: "True",
  };

  test('should successfully update visitor details (insert new visit) without dependents', async () => {
    // 1. Insert a visitor to get a valid ID
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name) VALUES ('Jane')`);
    const visitorId = visitorResult.lastID;

    // 2. Send the update request
    const response = await request(app)
      .post('/update-visitor-details')
      .send({ id: visitorId, ...sampleUpdateData });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('message', 'Visitor Updated Successfully & signed in!');
    expect(response.body).toHaveProperty('id'); // ID is the new visit ID

    // 3. Verify database state (new visit record exists)
    const visits = await allDb(mockDb, `SELECT * FROM visits WHERE visitor_id = ?`, [visitorId]);
    expect(visits).toHaveLength(1);
    expect(visits[0].known_as).toBe(sampleUpdateData.known_as);

    // 4. Verify dependents table is empty
    const dependents = await allDb(mockDb, `SELECT * FROM dependents`);
    expect(dependents).toHaveLength(0);

    // 5. Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  test('should successfully insert a new visit with valid JSON dependents', async () => {
    // 1. Insert a visitor to get a valid ID
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name) VALUES ('Jane')`);
    const visitorId = visitorResult.lastID;

    const dependentsJson = JSON.stringify([
      { full_name: "Child 1", age: 5 },
      { full_name: "Child 2", age: 7 },
    ]);

    // 2. Send the update request
    const response = await request(app)
      .post('/update-visitor-details')
      .send({ 
        id: visitorId, 
        ...sampleUpdateData, 
        additional_dependents: dependentsJson 
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('id');

    const newVisitId = response.body.id;

    // 3. Verify database state (new visit record exists)
    const visits = await allDb(mockDb, `SELECT * FROM visits WHERE visitor_id = ?`, [visitorId]);
    expect(visits).toHaveLength(1);

    // 4. Verify dependents were inserted and linked to the new visit
    const dependents = await allDb(mockDb, `SELECT * FROM dependents WHERE visit_id = ?`, [newVisitId]);
    expect(dependents).toHaveLength(2);
    expect(dependents.map(d => d.full_name)).toEqual(expect.arrayContaining(["Child 1", "Child 2"]));

    // 5. Verify logging
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
  });

  test('should handle missing visitor ID gracefully (400)', async () => {
    const response = await request(app)
      .post('/update-visitor-details')
      .send(sampleUpdateData); // No 'id' provided

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'Visitor ID is required for re-registration.');
    
    // Verify logging
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(/Re-registration attempted without Visitor ID/);
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  test('should handle non-existent visitor ID gracefully (404)', async () => {
    const nonExistentId = 999;
    
    // 1. Ensure DB is empty of visitors
    const initialVisitors = await allDb(mockDb, `SELECT * FROM visitors`);
    expect(initialVisitors).toHaveLength(0);

    // 2. Send the update request with a bad ID
    const response = await request(app)
      .post('/update-visitor-details')
      .send({ id: nonExistentId, ...sampleUpdateData });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Visitor ID not found.');

    // 3. Verify no transaction committed
    const visits = await allDb(mockDb, `SELECT * FROM visits`);
    expect(visits).toHaveLength(0);
    
    // 4. Verify logging
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatch(`Visitor re-registration failed: ID ${nonExistentId} not found (404).`);
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.info).not.toHaveBeenCalled();
  });

  test('should handle invalid dependents JSON gracefully (fallback to single dependent)', async () => {
    // 1. Insert a visitor to get a valid ID
    const visitorResult = await runDb(mockDb, `INSERT INTO visitors (first_name) VALUES ('Jane')`);
    const visitorId = visitorResult.lastID;

    const invalidJson = "This is definitely not JSON."; // A simple string instead of JSON

    // 2. Send the update request
    const response = await request(app)
      .post('/update-visitor-details')
      .send({ 
        id: visitorId, 
        ...sampleUpdateData, 
        additional_dependents: invalidJson 
      });

    expect(response.status).toBe(201);
    
    const newVisitId = response.body.id;

    // 3. Verify dependents were inserted using the fallback logic
    const dependents = await allDb(mockDb, `SELECT * FROM dependents WHERE visit_id = ?`, [newVisitId]);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].full_name).toBe(invalidJson);
    expect(dependents[0].age).toBeNull();
    
    // 4. Verify logging: should log an ERROR for the parsing failure
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error.mock.calls[0][0]).toMatch(/Failed to parse dependents JSON/);
  });

});