const sqlite3 = require("sqlite3").verbose();
const runDataComplianceCleanup = require("./clean_data");
const path = require("path");

// --- Mock Logger Setup ---
let loggerMock;

// Helper function to promisify db.run
const runDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
};

// Helper function to promisify db.get
const getDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

// Helper function to promisify db.all
const allDb = (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};


// Setup: Create the database and initialize the logger mock
let mockDb;

beforeAll(() => {
    mockDb = new sqlite3.Database(":memory:");
    // Initialize the logger mock here
    loggerMock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    // Create tables needed for cleanup logic
    return runDb(mockDb, `
        CREATE TABLE visitors (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, is_banned INTEGER DEFAULT 0)
    `).then(() => runDb(mockDb, `
        CREATE TABLE visits (id INTEGER PRIMARY KEY, visitor_id INTEGER, entry_time TEXT, exit_time TEXT)
    `)).then(() => runDb(mockDb, `
        CREATE TABLE dependents (id INTEGER PRIMARY KEY, visit_id INTEGER, full_name TEXT, age INTEGER)
    `)).then(() => runDb(mockDb, `
        CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, event_name TEXT, timestamp TEXT, status TEXT, profiles_deleted INTEGER, visits_deleted INTEGER, dependents_deleted INTEGER)
    `));
});

afterEach(async () => {
    // Clean up tables and mocks after each test
    await runDb(mockDb, "DELETE FROM dependents");
    await runDb(mockDb, "DELETE FROM visits");
    await runDb(mockDb, "DELETE FROM visitors");
    await runDb(mockDb, "DELETE FROM audit_logs");
    loggerMock.info.mockClear();
    loggerMock.error.mockClear();
    // Reset the run mock if it was used
    if (mockDb.run.mockRestore) {
        mockDb.run.mockRestore();
    }
});

afterAll((done) => {
    mockDb.close(done);
});


describe("runDataComplianceCleanup", () => {
    
    // Define a date 3 years ago (definitely older than 2 years)
    const oldDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
    // Define a date yesterday (definitely newer than 2 years)
    const newDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    test("should successfully delete old data and audit the transaction", async () => {
        // 1. Setup: Insert 1 old record to be deleted and 1 new record to remain
        
        // Visitor 1: Old and signed-out (will be deleted)
        let result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Old', 'Profile')`);
        const oldVisitorId = result.lastID;
        result = await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, ?)`, [oldVisitorId, oldDate, oldDate]);
        const oldVisitId = result.lastID;
        await runDb(mockDb, `INSERT INTO dependents (visit_id, full_name, age) VALUES (?, 'Old Dependent', 5)`, [oldVisitId]);
        
        // Visitor 2: New and signed-in (will remain)
        result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('New', 'Profile')`);
        const newVisitorId = result.lastID;
        result = await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [newVisitorId, newDate]);
        
        // 2. Execution: Pass the mock logger
        await runDataComplianceCleanup(mockDb, loggerMock); 

        // 3. Verification
        const remainingVisitors = await allDb(mockDb, "SELECT * FROM visitors");
        const remainingVisits = await allDb(mockDb, "SELECT * FROM visits");
        const remainingDependents = await allDb(mockDb, "SELECT * FROM dependents");
        const auditLog = await getDb(mockDb, "SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1");
        
        expect(remainingVisitors).toHaveLength(1); // New visitor remains
        expect(remainingVisits).toHaveLength(1); // New visit remains
        expect(remainingDependents).toHaveLength(0); // Old dependent deleted
        
        expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Starting Data Retention Compliance Cleanup Job'));
        expect(auditLog.status).toBe('OK');
        expect(auditLog.profiles_deleted).toBe(1);
        expect(auditLog.visits_deleted).toBe(1);
        expect(auditLog.dependents_deleted).toBe(1);
    });

    test("should handle case where no data needs to be deleted", async () => {
        // 1. Setup: Insert only new records
        let result = await runDb(mockDb, `INSERT INTO visitors (first_name, last_name) VALUES ('Recent', 'Visitor')`);
        const recentVisitorId = result.lastID;
        result = await runDb(mockDb, `INSERT INTO visits (visitor_id, entry_time, exit_time) VALUES (?, ?, NULL)`, [recentVisitorId, newDate]);
        
        // 2. Execution: Pass the mock logger
        await runDataComplianceCleanup(mockDb, loggerMock); 

        // 3. Verification
        const remainingVisitors = await allDb(mockDb, "SELECT * FROM visitors");
        const auditLog = await getDb(mockDb, "SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1");

        expect(remainingVisitors).toHaveLength(1);
        expect(auditLog.status).toBe('OK');
        expect(auditLog.profiles_deleted).toBe(0);
        expect(auditLog.visits_deleted).toBe(0);
        expect(auditLog.dependents_deleted).toBe(0);
        expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Cleanup: Deleted 0 old visit record(s).'));
    });

    test("should audit an ERROR status if database operation fails during cleanup", async () => {
        const originalDbRun = mockDb.run;

        // Mock a failure during the first delete operation (dependents)
        mockDb.run = jest.fn(function(sql, params, callback) {
            if (sql.includes('DELETE FROM dependents')) {
                // Simulate a database error
                callback(new Error('Mock Dependency Delete Error'));
            } else {
                // Use original function for everything else (including audit log writing)
                originalDbRun.apply(this, [sql, params, callback]);
            }
        });

        // 2. Execution: Pass the mock logger
        await runDataComplianceCleanup(mockDb, loggerMock); 

        // 3. Verification
        const auditLog = await getDb(mockDb, "SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1");
        
        expect(auditLog.status).toBe('ERROR');
        expect(auditLog.event_name).toBe('Compliance Cleanup Failed');
        // Ensure error was logged
        expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Mock Dependency Delete Error'));

        // Restore original DB function
        mockDb.run = originalDbRun; 
    });

    test("should log a FATAL error if audit log writing fails", async () => {
        const originalDbRun = mockDb.run;

        // Mock a failure during the audit log write operation
        mockDb.run = jest.fn(function(sql, params, callback) {
            if (sql.includes('INSERT INTO audit_logs')) {
                // Simulate a database error during the final audit log write
                callback(new Error('Mock Audit Log Write Error'));
            } else {
                // Use original function for cleanup (so we get OK status)
                originalDbRun.apply(this, [sql, params, callback]);
            }
        });

        // 2. Execution: Pass the mock logger
        await runDataComplianceCleanup(mockDb, loggerMock); 

        // 3. Verification: We expect the FATAL error log message
        //  The logger receives two arguments, so we assert against two arguments.
        expect(loggerMock.error).toHaveBeenCalledWith(
            "FATAL: Could not write audit log:",
            "Mock Audit Log Write Error"
        );

        // Restore original DB function
        mockDb.run = originalDbRun; 
    });
});