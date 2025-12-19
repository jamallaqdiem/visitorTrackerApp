const sqlite3 = require('sqlite3').verbose();
const fs = require("fs");
const path = require("path");

/**
 * Helper function to query table schema information using PRAGMA table_info.
 */
function getTableSchema(db, tableName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * Initializes the SQLite database and ensures all necessary tables are created.
 */
function initializeDatabase(dbPath = ':memory:') {
    return new Promise((resolve, reject) => {
        // We create the DB instance first
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                return reject(err);
            }
        });

        // Use db.serialize to ensure sequential execution
        db.serialize(() => {
            // Enable foreign keys
            db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
                if (pragmaErr) {
                    console.error('Error enabling foreign keys:', pragmaErr.message);
                    return reject(pragmaErr);
                }
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS visitors (
                    id INTEGER PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT,
                    is_banned INTEGER DEFAULT 0
                )
            `, (err) => {
                if (err) return reject(new Error('Failed to create visitors table: ' + err.message));
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS visits (
                    id INTEGER PRIMARY KEY,
                    visitor_id INTEGER NOT NULL,
                    entry_time TEXT NOT NULL,
                    exit_time TEXT,
                    known_as TEXT,
                    address TEXT,
                    phone_number TEXT,
                    unit TEXT,
                    reason_for_visit TEXT,
                    type TEXT,
                    company_name TEXT,
                    mandatory_acknowledgment_taken TEXT,
                    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
                )
            `, (err) => {
                if (err) return reject(new Error('Failed to create visits table: ' + err.message));
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS dependents (
                    id INTEGER PRIMARY KEY,
                    visit_id INTEGER NOT NULL,
                    full_name TEXT NOT NULL,
                    age INTEGER,
                    FOREIGN KEY (visit_id) REFERENCES visits(id)
                )
            `, (err) => {
                if (err) return reject(new Error('Failed to create dependents table: ' + err.message));
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY,
                    event_name TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    status TEXT NOT NULL,
                    profiles_deleted INTEGER,
                    visits_deleted INTEGER,
                    dependents_deleted INTEGER
                )
            `, (err) => {
                if (err) return reject(new Error('Failed to create audit_logs table: ' + err.message));
                // Resolve the promise with the DB instance only after everything is done
                resolve(db);
            });
        });
    });
}

// Internal Utility
function cleanOldBackups(backupDir, filePrefix, daysToRetain, logger) {
    const cutoffTime = Date.now() - daysToRetain * 24 * 60 * 60 * 1000;
    try {
        if (!fs.existsSync(backupDir)) return;

        const backupFiles = fs.readdirSync(backupDir)
            .filter((file) => file.startsWith(filePrefix) && file.endsWith(".db"));

        let deletedCount = 0;

        backupFiles.forEach((file) => {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            if (stats.mtimeMs < cutoffTime) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            logger.info(`Cleaned up ${deletedCount} old backup file(s).`);
        }
    } catch (error) {
        logger.error("Error during backup cleanup:", error.message);
    }
}

/**
 * Checks the database file for corruption using SQLite PRAGMA integrity_check.
 * @param {string} dbFilePath - Full path to the database file.
 * @returns {Promise<boolean>} Resolves to true if the database is OK, false otherwise.
 */
function checkDatabaseIntegrity(dbFilePath, logger) {
  return new Promise((resolve) => {
    // 1. Check if the file exists at all
    if (!fs.existsSync(dbFilePath)) {
      logger.info("Database file is missing (Integrity Check).");
      return resolve(false);
    }

    // 2. Open a read-only connection
    const db = new sqlite3.Database(
      dbFilePath,
      sqlite3.OPEN_READONLY,
      (err) => {
        if (err) {
          logger.error(
            "Could not open database file for integrity check:",
            err.message
          );
          return resolve(false);
        }
      }
    );

    
    // 3. Run the PRAGMA check using the 'db' instance directly
    db.all("PRAGMA integrity_check", (pragmaErr, rows) => {
        // Only run close and logic if the DB instance was successfully created
        if (db) db.close(); 

        if (pragmaErr) {
            logger.error("Error executing integrity check PRAGMA:", pragmaErr.message);
            return resolve(false);
        }

        const isCorrupt = rows.length > 0 && rows[0].integrity_check !== "ok";

        if (isCorrupt) {
            logger.error("Database corruption detected by PRAGMA integrity_check.");
        } else {
            logger.info("Database integrity check passed. File is OK.");
        }

        resolve(!isCorrupt);
    });
  });
}

/**
 * Restores the latest good backup.
 */
function restoreFromBackup(dataPath, logger, dbFileName = "database.db") {
    const backupDir = path.join(dataPath, "backups");
    const dbFilePath = path.join(dataPath, dbFileName);

    logger.info("Attempting database recovery...");

    if (!fs.existsSync(backupDir)) {
        logger.info("No backup directory found. Cannot restore.");
        return false;
    }

    const backupFiles = fs.readdirSync(backupDir)
        .filter((file) => file.startsWith(dbFileName.split(".")[0]) && file.endsWith(".db"))
        .sort().reverse();

    if (backupFiles.length === 0) {
        logger.info("No backup files found. Cannot restore.");
        return false;
    }

    const latestBackupFile = backupFiles[0];
    const latestBackupPath = path.join(backupDir, latestBackupFile);

    try {
        fs.copyFileSync(latestBackupPath, dbFilePath);
        logger.info(`Successfully restored database from: ${latestBackupFile}`);
        return true;
    } catch (error) {
        logger.error(`Error during database restoration:`, error.message);
        return false;
    }
}

/**
 * Creates a backup.
 */
function createBackup(dbFilePath, dataPath, logger) {
    const backupDir = path.join(dataPath, "backups");
    const daysToRetain = 7;

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const dbFileName = path.basename(dbFilePath);
    const backupFileNamePrefix = dbFileName.split(".")[0];
    const backupFileName = `${backupFileNamePrefix}-${dateStamp}.db`;
    const backupFilePath = path.join(backupDir, backupFileName);

    if (fs.existsSync(backupFilePath)) {
        logger.info(`Daily backup for ${dateStamp} already exists. Skipping.`);
        cleanOldBackups(backupDir, backupFileNamePrefix, daysToRetain, logger);
        return true;
    }

    try {
        fs.copyFileSync(dbFilePath, backupFilePath);
        logger.info(`Automated Daily Backup created: ${backupFileName}`);
        cleanOldBackups(backupDir, backupFileNamePrefix, daysToRetain, logger);
        return true;
    } catch (error) {
        logger.error(`Error creating automated backup:`, error.message);
        return false;
    }
}

module.exports = {
    initializeDatabase,
    getTableSchema,
    checkDatabaseIntegrity,
    restoreFromBackup,
    createBackup,
};