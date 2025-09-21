const request = require('supertest');
const express = require('express');
const sqlite3 = require('sqlite3');
const createRegistrationRouter = require('./registration');
const fs = require('fs');
const path = require('path');

// Mock the database for testing
const mockDb = new sqlite3.Database(':memory:');
mockDb.serialize(() => {
    mockDb.run(`CREATE TABLE visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT,
        last_name TEXT,
        photo_path TEXT
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
app.use('/', createRegistrationRouter(mockDb));

// Clean up the test database and mock files after each test
afterEach(() => {
    mockDb.run(`DELETE FROM visitors`);
    mockDb.run(`DELETE FROM visits`);
    mockDb.run(`DELETE FROM dependents`);
    // Clean up uploaded files
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(uploadsDir)) {
        fs.readdirSync(uploadsDir).forEach(file => {
            fs.unlinkSync(path.join(uploadsDir, file));
        });
    }
});

describe('POST /', () => {
    test('should register a new visitor with a photo and return 201', async () => {
        const response = await request(app)
            .post('/')
            .attach('photo', path.resolve(__dirname, 'Screenshot 2025-09-05 115636.png')) 
            .field('first_name', 'John')
            .field('last_name', 'Doe')
            .field('phone_number', '123-456-7890')
            .field('unit', '101')
            .field('reason_for_visit', 'Meeting')
            .field('type', 'Visitor')
            .field('company_name', 'Acme Inc.');

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message', 'Visitor registered successfully!');
        expect(response.body).toHaveProperty('id');
    });

    // Test case 2: Successful registration with dependents
    test('should register a new visitor and their dependents and return 201', async () => {
        const dependents = [{
            full_name: 'Jane Doe',
            age: 10
        }];
        const response = await request(app)
            .post('/')
            .field('first_name', 'John')
            .field('last_name', 'Doe')
            .field('phone_number', '123-456-7890')
            .field('unit', '101')
            .field('reason_for_visit', 'Meeting')
            .field('type', 'Visitor')
            .field('company_name', 'Acme Inc.')
            .field('additional_dependents', JSON.stringify(dependents));
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('message', 'Visitor registered successfully!');
    });

    // Test case 3: Invalid file type
    test('should return 400 for an invalid file type', async () => {
        const response = await request(app)
            .post('/')
            .attach('photo', Buffer.from('test data'), 'test.txt')
            .field('first_name', 'John')
            .field('last_name', 'Doe')
            .field('phone_number', '123-456-7890')
            .field('unit', '101')
            .field('reason_for_visit', 'Meeting')
            .field('type', 'Visitor');
            
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Invalid file type, only JPEG, PNG, or GIF is allowed!');
    });
});