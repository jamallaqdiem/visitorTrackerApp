const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createLogoutRouter = require("./logout");

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
  mockDb.run(`CREATE TABLE visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT
  )`);
  mockDb.run(`CREATE TABLE visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id INTEGER,
    entry_time TEXT NOT NULL,
    exit_time TEXT,
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
  )`);
});

// Create a mock Express app to test the router
const app = express();
app.use(express.json());
app.use("/", createLogoutRouter(mockDb));

// Clean up the test database after each test
afterEach(async () => {
  await new Promise((resolve, reject) => {
    mockDb.run(`DELETE FROM visits`, (err) => {
      if (err) return reject(err);
      mockDb.run(`DELETE FROM visitors`, (err) => {
        if (err) return reject(err);
        resolve();
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

describe('POST /exit-visitor/:id', () => {
  test('should successfully log out a visitor and return 200', async () => {
    // Insert a sample visitor and an active visit
    const visitorId = await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name) VALUES ('Jane')`, function(err) {
        if (err) return reject(err);
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time) VALUES (?, ?)`, [this.lastID, new Date().toISOString()], (err) => {
          if (err) return reject(err);
          resolve(this.lastID);
        });
      });
    });

    const response = await request(app).post(`/exit-visitor/${visitorId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', `Visitor ${visitorId} has been signed out.`);

    // Verify the exit time was set in the database
    const visit = await new Promise((resolve, reject) => {
      mockDb.get(`SELECT * FROM visits WHERE visitor_id = ? AND exit_time IS NOT NULL`, [visitorId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    expect(visit).not.toBeNull();
  });

  test('should return 404 for a non-existent visitor ID', async () => {
    const response = await request(app).post(`/exit-visitor/999`);
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Visitor not found or already signed out.');
  });
});
