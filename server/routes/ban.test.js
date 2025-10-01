const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createBanVisitorRouter = require("./ban");

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
  mockDb.run(`CREATE TABLE visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    is_banned BOOLEAN DEFAULT 0
  )`);
});

// Create a mock Express app to test the router
const app = express();
app.use(express.json());
app.use("/", createBanVisitorRouter(mockDb));

// Clean up the test database after each test
afterEach(async () => {
  await new Promise((resolve, reject) => {
    mockDb.run(`DELETE FROM visitors`, (err) => {
      if (err) return reject(err);
      resolve();
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

describe('POST /ban-visitor/:id', () => {
  test('should successfully ban an existing visitor and return 200', async () => {
    // Insert a sample visitor
    const visitorId = await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name) VALUES ('Jamal')`, function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });

    const response = await request(app).post(`/ban-visitor/${visitorId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', `Visitor has been banned.`);

    // Verifying the visitor's status in the database
    const visitor = await new Promise((resolve, reject) => {
      mockDb.get(`SELECT is_banned FROM visitors WHERE id = ?`, [visitorId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    expect(visitor.is_banned).toBe(1);
  });

  test('should return 404 for a non-existent visitor ID', async () => {
    const nonExistentId = 999;
    const response = await request(app).post(`/ban-visitor/${nonExistentId}`);
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Visitor not found.');
  });
});
