const request = require('supertest');
const express = require('express');
const sqlite3 = require('sqlite3');
const createRegistrationRouter = require('./registration');

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');

// --- Mock Upload Object ---
// We MUST still define this because the router function signature requires it.
const mockUpload = {
    // These functions simply return dummy Express middleware (req, res, next) => next()
    single: () => (req, res, next) => next(),
    none: () => (req, res, next) => next(),
    array: () => (req, res, next) => next(),
    fields: () => (req, res, next) => next(),
};
// --- End Mock Upload ---


mockDb.serialize(() => {
    // Minimal required schema setup
    mockDb.run(`CREATE TABLE visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        photo_path TEXT,
        is_banned INTEGER DEFAULT 0 
    )`);
    mockDb.run(`CREATE TABLE visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id INTEGER,
        entry_time TEXT,
        phone_number TEXT,
        unit TEXT,
        reason_for_visit TEXT,
        type TEXT,
        company_name TEXT
    )`);
    // Including dependents table to prevent schema errors in the actual router logic
    mockDb.run(`CREATE TABLE dependents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT,
        age INTEGER,
        visit_id INTEGER
    )`);
});

// Create a mock Express app
const app = express();
// IMPORTANT: Enable JSON parsing for our tests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach the registration router using the mock upload middleware
// The path here is assumed to be '/', matching the test's .post('/')
app.use('/', createRegistrationRouter(mockDb, mockUpload)); 

// Clean up the test database after each test
afterEach(() => {
    mockDb.run(`DELETE FROM visitors`);
    mockDb.run(`DELETE FROM visits`);
    mockDb.run(`DELETE FROM dependents`);
});

describe('POST /', () => {
    // Using .send() with JSON payload
    test('should register a new visitor with data and return 201', async () => {
        const registrationData = {
            first_name: 'Jamal',
            last_name: 'Laqdiem',
            phone_number: '022277',
            unit: '101',
            reason_for_visit: 'Meeting',
            type: 'Visitor',
            company_name: 'NHS',
        };

        const response = await request(app)
            .post('/register-visitor')
            .send(registrationData) // Send data as JSON
            .set('Content-Type', 'application/json'); 

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message', "Visitor registered successfully!"); 
        expect(response.body).toHaveProperty('id');
    });
});
