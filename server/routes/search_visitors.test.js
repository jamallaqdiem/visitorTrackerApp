const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createSearchVisitorsRouter = require("./search_visitors");

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
  mockDb.run(`CREATE TABLE visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    photo_path TEXT,
    is_banned BOOLEAN
  )`);
  mockDb.run(`CREATE TABLE visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id INTEGER,
    entry_time TEXT,
    exit_time TEXT,
    phone_number TEXT,
    unit TEXT,
    reason_for_visit TEXT,
    type TEXT,
    company_name TEXT
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
app.use("/", createSearchVisitorsRouter(mockDb));

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

describe('GET /visitor-search', () => {
  test('should return a visitor when a valid search term is provided', async () => {
    // Insert a sample visitor and visit record
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name, is_banned) VALUES ('John', 'Smith', 0)`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time) VALUES (?, ?)`, [visitorId, new Date().toISOString()], (err) => {
          if (err) return reject(err);
          resolve(visitorId);
        });
      });
    });

    const response = await request(app)
      .get('/visitor-search?name=John');

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].first_name).toBe('John');
  });

  test('should return 400 if no search term is provided', async () => {
    const response = await request(app)
      .get('/visitor-search');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', "Search term 'name' is required.");
  });
});
