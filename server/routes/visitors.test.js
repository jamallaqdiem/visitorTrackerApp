const request = require("supertest");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const createVisitorsRouter = require("./visitors");

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
  mockDb.run(`CREATE TABLE visitors (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    photo_path TEXT,
    is_banned INTEGER DEFAULT 0
  )`);
  mockDb.run(`CREATE TABLE visits (
    id INTEGER PRIMARY KEY,
    visitor_id INTEGER NOT NULL,
    entry_time TEXT NOT NULL,
    exit_time TEXT,
    phone_number TEXT,
    unit TEXT,
    reason_for_visit TEXT,
    company_name TEXT,
    type TEXT,
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
  )`);
});

// Create a mock Express app to test the router
const app = express();
app.use("/", createVisitorsRouter(mockDb));

// Clean up the test database after each test
afterEach(async () => {
  await new Promise((resolve, reject) => {
    mockDb.run("DELETE FROM visits", (err) => {
      if (err) return reject(err);
      mockDb.run("DELETE FROM visitors", (err) => {
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

describe("GET /visitors", () => {
  test("should return an empty array if no visitors are signed in", async () => {
    const response = await request(app).get("/visitors");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test("should return only currently signed-in visitors", async () => {
    // Insert a signed-in visitor
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name) VALUES ('Jane', 'Doe')`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, new Date().toISOString()], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // Make the request and verify the response
    const response = await request(app).get("/visitors");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].first_name).toBe("Jane");
  });

  test("should only return visitors with a NULL exit_time", async () => {
    // Insert a signed-in visitor
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name) VALUES ('Jane', 'Doe')`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, new Date().toISOString()], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
    
    // Insert a signed-out visitor
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name) VALUES ('John', 'Smith')`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, [visitorId, new Date().toISOString(), new Date().toISOString()], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
    
    // Make the request and verify the response
    const response = await request(app).get("/visitors");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].first_name).toBe("Jane");
  });
  
  test("should return visitors sorted by entry_time in descending order", async () => {
    // Insert an earlier visitor
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name) VALUES ('Early', 'Bird')`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T10:00:00Z"], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
    
    // Insert a later visitor
    await new Promise((resolve, reject) => {
      mockDb.run(`INSERT INTO visitors (first_name, last_name) VALUES ('Late', 'Comer')`, function(err) {
        if (err) return reject(err);
        const visitorId = this.lastID;
        mockDb.run(`INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [visitorId, "2023-01-01T11:00:00Z"], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
    
    // Make the request and verify the order
    const response = await request(app).get("/visitors");
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].first_name).toBe("Late");
    expect(response.body[1].first_name).toBe("Early");
  });
});
