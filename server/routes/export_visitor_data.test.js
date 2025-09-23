const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createExportRouter = require("./export_visitor_data");

// Mock the database for testing
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
    entry_time TEXT NOT NULL,
    exit_time TEXT,
    phone_number TEXT,
    unit TEXT,
    reason_for_visit TEXT,
    company_name TEXT,
    type TEXT,
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
app.use("/", createExportRouter(mockDb));

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

describe('GET /export-visitors', () => {
  test('should successfully export visitor data to CSV', async () => {
    // Insert a sample visitor and visit with dependents
    const visitorId = await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name, is_banned) VALUES ('John', 'Doe', 0)`, function(err) {
        if (err) return reject(err);
        const visitor_id = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, type, unit) VALUES (?, ?, 'Personal', 'Apt 101')`, [visitor_id, new Date().toISOString()], function(err) {
          if (err) return reject(err);
          const visit_id = this.lastID;
          mockDb.run(`INSERT INTO dependents (full_name, age, visit_id) VALUES ('Jane Doe', 10, ?)`, [visit_id], (err) => {
            if (err) return reject(err);
            resolve(visitor_id);
          });
        });
      });
    });

    const response = await request(app).get(`/export-visitors?id=${visitorId}`);

    expect(response.status).toBe(200);
    expect(response.header['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.text).toContain('first_name,last_name');
    expect(response.text).toContain('"John","Doe"');
    expect(response.text).toContain('"Jane Doe (10)"');
  });

  test('should return 400 if visitor ID is not provided', async () => {
    const response = await request(app).get(`/export-visitors`);
    expect(response.status).toBe(400);
    expect(response.text).toBe('Visitor ID is required for export.');
  });

  test('should return "No data to export." for a non-existent visitor ID', async () => {
    const nonExistentId = 999;
    const response = await request(app).get(`/export-visitors?id=${nonExistentId}`);
    expect(response.status).toBe(200);
    expect(response.text).toBe('No data to export.');
  });
});
