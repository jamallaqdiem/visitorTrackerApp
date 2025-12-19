const fs = require('fs');
const path = require('path');
const dbManagement = require('./db_management');

// --- 1. MOCK SQLITE3 ENTIRELY ---

const mockRun = jest.fn((sql, callback) => {
    // If a callback is provided, simulate success (err = null)
    if (callback) callback(null); 
});

const mockAll = jest.fn((sql, callback) => {
    // Default: return empty array, no error
    if (callback) callback(null, []); 
});

const mockSerialize = jest.fn((callback) => {
    // Execute the callback immediately
    callback();
});

const mockClose = jest.fn();

const mockDbInstance = {
    run: mockRun,
    all: mockAll,
    serialize: mockSerialize,
    close: mockClose,
};

// The mock factory for sqlite3
jest.mock('sqlite3', () => {
    return {
        verbose: () => ({
            Database: jest.fn((path, options, callback) => {
                // Handle different signatures of new Database()
                if (typeof options === 'function') {
                    options(null); // Call the callback if it's the 2nd arg
                } else if (typeof callback === 'function') {
                    callback(null); // Call the callback if it's the 3rd arg
                }
                return mockDbInstance;
            }),
            OPEN_READONLY: 1, // Constant needed by  code
        }),
    };
});

// --- 2. MOCK FS MODULE ---
jest.mock('fs');

// --- 3. MOCK LOGGER ---
const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
};

describe('Database Management System', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('initializeDatabase', () => {
        it('should initialize database and attempt to create tables', async () => {
            // ACT
            const db = await dbManagement.initializeDatabase(':memory:');

            // ASSERT
            // 1. Verify foreign keys were turned on
            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('PRAGMA foreign_keys = ON'), 
                expect.any(Function)
            );

            // 2. Verify table creations were called
            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS visitors'), expect.any(Function));
            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS visits'), expect.any(Function));
            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS dependents'), expect.any(Function));
            expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS audit_logs'), expect.any(Function));

            // 3. Verify it returns our mock DB object
            expect(db).toBe(mockDbInstance);
        });
    });

    describe('getTableSchema', () => {
        it('should return schema rows', async () => {
            //  Tell the mock .all() to return specific fake data
            const fakeSchema = [{ cid: 1, name: 'id', type: 'INTEGER' }];
            
            mockAll.mockImplementationOnce((sql, cb) => {
                cb(null, fakeSchema); 
            });

            // ACT
            const result = await dbManagement.getTableSchema(mockDbInstance, 'visitors');

            // ASSERT
            expect(mockAll).toHaveBeenCalledWith(expect.stringContaining('PRAGMA table_info(visitors)'), expect.any(Function));
            expect(result).toEqual(fakeSchema);
        });
    });

    describe('createBackup', () => {
        it('should create a backup file if one does not exist for today', () => {
            // ARRANGE
            const dbPath = '/path/to/database.db';
            const dataPath = '/path/to';
            
            // Mock fs sequence
            fs.existsSync
                .mockReturnValueOnce(true)   // Backup dir exists
                .mockReturnValueOnce(false)  // Today's backup does NOT exist
                .mockReturnValue(true);      // Internal check inside cleanup

            fs.readdirSync.mockReturnValue([]); // No old files to clean

            // ACT
            const result = dbManagement.createBackup(dbPath, dataPath, mockLogger);

            // ASSERT
            expect(result).toBe(true);
            expect(fs.copyFileSync).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Automated Daily Backup created'));
        });
    });

    describe('checkDatabaseIntegrity', () => {
        it('should return true when PRAGMA integrity_check returns ok', async () => {
            // ARRANGE
            fs.existsSync.mockReturnValue(true); // File exists

            // Mock .all() to return "ok"
            mockAll.mockImplementationOnce((sql, cb) => {
                cb(null, [{ integrity_check: 'ok' }]);
            });

            // ACT
            const result = await dbManagement.checkDatabaseIntegrity('test.db', mockLogger);

            // ASSERT
            expect(result).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('passed'));
        });

        it('should return false if database file is missing', async () => {
            fs.existsSync.mockReturnValue(false); 

            const result = await dbManagement.checkDatabaseIntegrity('test.db', mockLogger);

            expect(result).toBe(false);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('missing'));
        });
    });

    describe('restoreFromBackup', () => {
   it('should restore from the latest backup file', () => {
            // ARRANGE
            const dataPath = '/data';
            
            fs.existsSync.mockReturnValue(true); // Backup dir exists
            
            // This is the file list that the function is filtering/sorting
            fs.readdirSync.mockReturnValue([ 
                'database-2023-01-01.db', 
                'database-2023-12-31.db' // This is the latest
            ]);

            // ACT
            const result = dbManagement.restoreFromBackup(dataPath, mockLogger);

            // ASSERT
            expect(result).toBe(true);
            
            //  assert on 'database-' prefix, matching the Received value.
            expect(fs.copyFileSync).toHaveBeenCalledWith(
                expect.stringContaining('database-2023-12-31.db'), 
                expect.any(String) // The second argument is the destination path
            );
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully restored database from: database-2023-12-31.db'));
        });;
    });
});