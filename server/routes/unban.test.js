const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createUnbanVisitorRouter = require("./unban");

// Mock the master password from the environment for testing
process.env.MASTER_PASSWORD = "test_password";

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
app.use("/", createUnbanVisitorRouter(mockDb));

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

describe('POST /unban-visitor/:id', () => {
  test('should successfully unban a visitor with the correct password', async () => {
    // Insert a sample banned visitor
    const visitorId = await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, is_banned) VALUES ('Jane', 1)`, function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });

    const response = await request(app)
      .post(`/unban-visitor/${visitorId}`)
      .send({ password: "test_password" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', `Visitor ${visitorId} has been unbanned.`);

    // Verify the visitor's status in the database
    const visitor = await new Promise((resolve, reject) => {
      mockDb.get(`SELECT is_banned FROM visitors WHERE id = ?`, [visitorId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    expect(visitor.is_banned).toBe(0);
  });

  test('should return 403 for an incorrect password', async () => {
    // Insert a sample banned visitor
    const visitorId = await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, is_banned) VALUES ('Jane', 1)`, function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });

    const response = await request(app)
      .post(`/unban-visitor/${visitorId}`)
      .send({ password: "wrong_password" });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('message', 'Incorrect password.');
  });

  test('should return 404 for a non-existent visitor ID', async () => {
    const nonExistentId = 999;
    const response = await request(app)
      .post(`/unban-visitor/${nonExistentId}`)
      .send({ password: "test_password" }); // Correct password but no ID

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('message', 'Visitor not found.');
  });
});
