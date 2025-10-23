const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createLoginRouter = require("./login");

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
  mockDb.run(`CREATE TABLE visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    photo_path TEXT,
    is_banned
  )`);
  mockDb.run(`CREATE TABLE visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id INTEGER,
    entry_time TEXT,
    exit_time TEXT,
    known_as,
    address,
    phone_number TEXT,
    unit TEXT,
    reason_for_visit TEXT,
    type TEXT,
    company_name TEXT,
    mandatory_acknowledgment_taken TEXT
  )`);
  mockDb.run(`CREATE TABLE dependents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT,
    age INTEGER,
    visit_id INTEGER
  )`);
});

// Create a mock Express app to test the router
const app = express();
app.use(express.json());
app.use("/", createLoginRouter(mockDb));

// Clean up the test database after each test
afterEach(async () => {
  await new Promise((resolve, reject) => {
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

// Close the database connection after all tests
afterAll((done) => {
  mockDb.close((err) => {
    if (err) console.error(err.message);
    done();
  });
});

describe('POST /login', () => {
  test('should successfully log in an existing visitor and return 200', async () => {
    // Insert a sample visitor and visit record
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name, is_banned) VALUES ('Jamal', 'Laqdiem', 0)`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, known_as, address, phone_number, unit, type, mandatory_acknowledgment_taken) VALUES (?, ?, 'miky', '700 london road Portsmouth Po30 7ur', '07777890', '101', 'Visitor', 'true')`, [visitorId, new Date().toISOString()], (err) => {
          if (err) return reject(err);
          resolve(visitorId);
        });
      });
    });

    const response = await request(app)
      .post('/login')
      .send({ id: 1 }); 

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Visitor signed in successfully!');
    expect(response.body).toHaveProperty('visitorData');
    expect(response.body.visitorData.id).toBe(1);
  });
});
