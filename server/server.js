// server/server.js
require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const app = express();
const PORT = 3001;
const logger = require("./logger");
const { updateStatus, getStatus } = require("./status_tracker");

// IMPORT DB MANAGEMENT FUNCTIONS
const {
  checkDatabaseIntegrity,
  restoreFromBackup,
  createBackup,
} = require("./db_management");

const runDataComplianceCleanup = require("./routes/clean_data");
const createRegistrationRouter = require("./auth/registration");
const createVisitorsRouter = require("./routes/visitors");
const createLoginRouter = require("./routes/login");
const createUpdateVisitorRouter = require("./routes/update_visitor_details");
const createLogoutRouter = require("./routes/logout");
const createBanVisitorRouter = require("./routes/ban");
const createUnbanVisitorRouter = require("./routes/unban");
const createSearchVisitorsRouter = require("./routes/search_visitors");
const createMissedVisitRouter = require("./routes/record_missed_visit");
const createHistoryRouter = require("./routes/display_history");
const createAuditRouter = require("./routes/audit_logs");

const DB_FILE_PATH = path.join(__dirname, "database.db");
const UPLOADS_DIR_PATH = path.join(__dirname, "uploads");

// Define SQL commands
const visitorsSql = `CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  photo_path TEXT,
  is_banned BOOLEAN DEFAULT 0
)`;

const visitsSql = `CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  visitor_id INTEGER NOT NULL,
  entry_time TEXT NOT NULL,
  exit_time TEXT,
  known_as TEXT,
  address TEXT,
  phone_number TEXT,
  unit TEXT NOT NULL,
  reason_for_visit TEXT,
  type TEXT NOT NULL,
  company_name TEXT,
  mandatory_acknowledgment_taken BOOLEAN DEFAULT 0,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id)
)`;

const dependentsSql = `CREATE TABLE IF NOT EXISTS dependents (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  visit_id INTEGER NOT NULL,
  FOREIGN KEY (visit_id) REFERENCES visits(id)
)`;

const auditLogsSql = `CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  event_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  profiles_deleted INTEGER,
  visits_deleted INTEGER,
  dependents_deleted INTEGER
)`;

// Middleware setup
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Use the fully resolved path
app.use("/uploads", express.static(UPLOADS_DIR_PATH));

// Ensure the uploads directory exists
if (!fs.existsSync(UPLOADS_DIR_PATH)) {
  fs.mkdirSync(UPLOADS_DIR_PATH, { recursive: true });
}

// --- ASYNCHRONOUS INITIALIZATION AND SETUP FUNCTION ---
const initializeServer = async () => {
  // --- 1. DATABASE INTEGRITY CHECK & RECOVERY ---
  let isDatabaseClean = await checkDatabaseIntegrity(DB_FILE_PATH, logger);
  const maxRestoreAttempts = 2;
  let attempt = 1;

  while (!isDatabaseClean && attempt <= maxRestoreAttempts) {
    logger.warn(
      `Database check failed (Attempt ${attempt}). Attempting automatic recovery...`
    );

    // Pass the server directory (__dirname) as the path where the DB and backups folder reside
    const restoreSuccess = restoreFromBackup(__dirname, logger);

    if (restoreSuccess) {
      logger.info(
        `Restoration complete. Checking integrity of the new file...`
      );
      isDatabaseClean = await checkDatabaseIntegrity(DB_FILE_PATH, logger);

      if (isDatabaseClean) {
        logger.info(
          " Database successfully recovered and integrity check passed."
        );
        break;
      }
    } else if (attempt === 1) {
      logger.error(
        "No valid backups found. A new database file will be created on connection."
      );
      break;
    }

    attempt++;
  }

  if (!isDatabaseClean && attempt > maxRestoreAttempts) {
    logger.error(
      "🚨 CRITICAL ERROR: Database and all backups appear corrupt or unusable. HALTING SERVER STARTUP."
    );
    return; // Halt server initialization
  }

  //INITIALIZE DB AND MULTER

  // Connect to SQLite database
  const db = await new Promise((resolve, reject) => {
    const dbInstance = new sqlite3.Database(DB_FILE_PATH, (err) => {
      if (err) {
        return reject(
          new Error(`Database connection error (Fatal): ${err.message}`)
        );
      }
      logger.info("Connected to the database at:", DB_FILE_PATH);
      updateStatus("db_ready", true); // 🔑 UPDATE STATUS ON SUCCESS
      updateStatus("last_error", null);
      resolve(dbInstance);
    });
  }).catch((error) => {
    logger.error(error.message);
    updateStatus("db_ready", false); // 🔑 UPDATE STATUS ON FAILURE
    updateStatus("last_error", error.message);
    return null; // Return null if connection fails
  });

  if (!db) return; // Exit if DB connection failed

  // AUTOMATED BACKUP LOGIC
  const backupSuccess = createBackup(DB_FILE_PATH, __dirname, logger);
  if (backupSuccess) updateStatus("last_backup", new Date().toISOString()); // 🔑 UPDATE STATUS ON SUCCESS

  // Set up multer for file uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOADS_DIR_PATH);
    },
    filename: function (req, file, cb) {
      cb(
        null,
        file.fieldname + "-" + Date.now() + path.extname(file.originalname)
      );
    },
  });
  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 20 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      if (["image/jpeg", "image/png", "image/gif"].includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error("Invalid file type, only JPEG, PNG, or GIF is allowed!"),
          false
        );
      }
    },
  });

  // CREATE TABLES AND ATTACH ROUTE

  db.serialize(() => {
    // Run table creation scripts
    db.run(visitorsSql, (err) => {
      if (err)
        return logger.error("Visitors Table Error (Fatal):", err.message);
      db.run(visitsSql, (err) => {
        if (err)
          return logger.error("Visits Table Error (Fatal):", err.message);
        db.run(dependentsSql, (err) => {
          if (err)
            return logger.error("Dependents Table Error (Fatal):", err.message);
          db.run(auditLogsSql, (err) => {
            if (err)
              return logger.error(
                "Audit Logs Table Error (Fatal):",
                err.message
              );

            // Running cleanup job.
            runDataComplianceCleanup(db, logger);
            updateStatus("last_cleanup", new Date().toISOString()); // 🔑 UPDATE STATUS ON SUCCESS

            // Router usage Attached only after DB is ready
            app.get("/api/status", (req, res) => {
              res.json(getStatus());
            });
            
            app.use("/api/audit/", createAuditRouter(db, logger));
            app.use("/", createRegistrationRouter(db, upload, logger));
            app.use("/", createVisitorsRouter(db, logger));
            app.use("/", createLoginRouter(db, logger));
            app.use("/", createUpdateVisitorRouter(db, logger));
            app.use("/", createLogoutRouter(db, logger));
            app.use("/", createBanVisitorRouter(db, logger));
            app.use("/", createUnbanVisitorRouter(db, logger));
            app.use("/", createSearchVisitorsRouter(db, logger));
            app.use("/", createMissedVisitRouter(db, logger));
            app.use("/", createHistoryRouter(db, logger));

            //  START LISTENING ONLY AFTER ALL DB WORK AND ROUTERS ARE ATTACHED
            app.listen(PORT, () => {
              logger.info(`Server is running on http://localhost:${PORT}`);
            });
          });
        });
      });
    });
  });
};

if (require.main === module) {
  // Execute the async initialization function only when run directly (i.e., not imported by a test file)
  initializeServer();
}
module.exports = { initializeServer, app };
