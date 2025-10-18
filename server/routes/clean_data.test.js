const sqlite3 = require('sqlite3').verbose();
const runDataComplianceCleanup = require('./clean_data'); 

const dbRun = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

const dbGet = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

// --- Mock Database Setup ---
let mockDb;

const setupDatabase = () => {
    return new Promise((resolve) => {
        // Using an in-memory 
        mockDb = new sqlite3.Database(':memory:');

        // Table definitions 
        const tableSql = [
            `CREATE TABLE visitors ( id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, photo_path TEXT, is_banned BOOLEAN DEFAULT 0 )`,
            `CREATE TABLE visits ( id INTEGER PRIMARY KEY, visitor_id INTEGER NOT NULL, entry_time TEXT NOT NULL, exit_time TEXT, known_as TEXT, address TEXT, phone_number TEXT, unit TEXT NOT NULL, reason_for_visit TEXT, type TEXT NOT NULL, company_name TEXT, FOREIGN KEY (visitor_id) REFERENCES visitors(id) )`,
            `CREATE TABLE dependents ( id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, age INTEGER, visit_id INTEGER NOT NULL, FOREIGN KEY (visit_id) REFERENCES visits(id) )`,
            `CREATE TABLE audit_logs ( id INTEGER PRIMARY KEY, event_name TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT NOT NULL, profiles_deleted INTEGER, visits_deleted INTEGER, dependents_deleted INTEGER )`
        ];

        mockDb.serialize(async () => {
            for (const sql of tableSql) {
                await dbRun(mockDb, sql);
            }
            resolve();
        });
    });
};

// --- Helper to insert data for the test case ---
async function insertTestData(oldVisitorName, newVisitorName) {
    // 3 years ago (should be deleted by the 2-year cleanup rule)
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString();
    
    // 1. Data Set A: OLD (to be deleted)
    const oldV = await dbRun(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES (?, ?)`, [oldVisitorName, 'Old']);
    const oldVisit = await dbRun(mockDb, `INSERT INTO visits (visitor_id, entry_time, unit, type) VALUES (?, ?, 'A1', 'Personal')`, [oldV.id, threeYearsAgo]);
    await dbRun(mockDb, `INSERT INTO dependents (full_name, visit_id) VALUES (?, ?)`, ['Old Kid', oldVisit.id]);
    
    // 2. Data Set B: NEW (to be kept)
    const newV = await dbRun(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES (?, ?)`, [newVisitorName, 'New']);
    await dbRun(mockDb, `INSERT INTO visits (visitor_id, entry_time, unit, type) VALUES (?, ?, 'B2', 'Delivery')`, [newV.id, today]);
}

// --- Test Lifecycle Hooks ---
beforeEach(async () => {
    // 1. Setup fresh in-memory database
    await setupDatabase();
    // 2. Insert test data
    await insertTestData('OldAlice', 'NewBob');
});

afterEach(async () => {
    // Close the in-memory database after each test
    await new Promise((resolve) => mockDb.close(resolve));
});

afterAll((done) => {
    done();
});

// --- Test Suite ---
describe('Data Retention Compliance Cleanup', () => {
    test('should correctly delete old records and log the changes to the audit table', async () => {
        await new Promise(resolve => runDataComplianceCleanup(mockDb, resolve));

        // 1. Assert Database State after Cleanup
        const totalVisitors = await dbGet(mockDb, 'SELECT COUNT(id) AS count FROM visitors');
        const totalVisits = await dbGet(mockDb, 'SELECT COUNT(id) AS count FROM visits');
        const totalDependents = await dbGet(mockDb, 'SELECT COUNT(id) AS count FROM dependents');
        
        // Only the "NewBob" records should remain.
        expect(totalVisitors.count).toBe(1);
        expect(totalVisits.count).toBe(1);
        expect(totalDependents.count).toBe(0);

        const remainingVisitor = await dbGet(mockDb, 'SELECT first_name FROM visitors');
        expect(remainingVisitor.first_name).toBe('NewBob');

        // 2. Assert Audit Log Integrity
        const auditLog = await dbGet(mockDb, `SELECT * FROM audit_logs WHERE event_name = 'Compliance Cleanup Succeeded'`);

        // Check if the audit log was created
        expect(auditLog).toBeDefined();
        
        // Check the reported deletion counts
        expect(auditLog.profiles_deleted).toBe(1);
        expect(auditLog.visits_deleted).toBe(1);
        expect(auditLog.dependents_deleted).toBe(1);
        
        expect(auditLog.status).toBe('OK');
    });

    test('should delete nothing when all data is recent', async () => {
        await new Promise((resolve) => mockDb.run(`DELETE FROM dependents`, resolve));
        await new Promise((resolve) => mockDb.run(`DELETE FROM visits`, resolve));
        await new Promise((resolve) => mockDb.run(`DELETE FROM visitors`, resolve));

        // Insert fresh data
        const today = new Date().toISOString();
        const v1 = await dbRun(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES (?, ?)`, ['Fresh', 'One']);
        await dbRun(mockDb, `INSERT INTO visits (visitor_id, entry_time, unit, type) VALUES (?, ?, 'C3', 'Delivery')`, [v1.id, today]);
        
        // Run cleanup
        await new Promise(resolve => runDataComplianceCleanup(mockDb, resolve));

        // Assert Database State
        const totalVisitors = await dbGet(mockDb, 'SELECT COUNT(id) AS count FROM visitors');
        const totalVisits = await dbGet(mockDb, 'SELECT COUNT(id) AS count FROM visits');

        // All 1 visitor and 1 visit should remain
        expect(totalVisitors.count).toBe(1);
        expect(totalVisits.count).toBe(1);

        // Assert Audit Log Integrity
        const auditLog = await dbGet(mockDb, `SELECT * FROM audit_logs WHERE event_name = 'Compliance Cleanup Succeeded'`);
        
        // All deletion counts should be zero
        expect(auditLog.profiles_deleted).toBe(0);
        expect(auditLog.visits_deleted).toBe(0);
        expect(auditLog.dependents_deleted).toBe(0);
    });
});
