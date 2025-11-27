// server/server.js
require('dotenv').config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const app = express();
const PORT = 3001;

// IMPORT DB MANAGEMENT FUNCTIONS
const { 
  checkDatabaseIntegrity, 
  restoreFromBackup, 
  createBackup 
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
  let isDatabaseClean = await checkDatabaseIntegrity(DB_FILE_PATH);
  const maxRestoreAttempts = 2; 
  let attempt = 1;
  
  while (!isDatabaseClean && attempt <= maxRestoreAttempts) {
      console.warn(`⚠️ Database check failed (Attempt ${attempt}). Attempting automatic recovery...`);
      
      // Pass the server directory (__dirname) as the path where the DB and backups folder reside
      const restoreSuccess = restoreFromBackup(__dirname); 
      
      if (restoreSuccess) {
          console.log(`Restoration complete. Checking integrity of the new file...`);
          isDatabaseClean = await checkDatabaseIntegrity(DB_FILE_PATH);
          
          if (isDatabaseClean) {
              console.log("✅ Database successfully recovered and integrity check passed.");
              break; 
          }
      } else if (attempt === 1) {
          console.error("No valid backups found. A new database file will be created on connection.");
          break; 
      }

      attempt++;
  }
  
  if (!isDatabaseClean && attempt > maxRestoreAttempts) {
      console.error("🚨 CRITICAL ERROR: Database and all backups appear corrupt or unusable. HALTING SERVER STARTUP.");
      return; // Halt server initialization
  }
  
  //INITIALIZE DB AND MULTER
  
  // Connect to SQLite database
  const db = await new Promise((resolve, reject) => {
    const dbInstance = new sqlite3.Database(DB_FILE_PATH, (err) => {
      if (err) {
        return reject(new Error(`Database connection error (Fatal): ${err.message}`));
      }
      console.log("Connected to the database at:", DB_FILE_PATH);
      resolve(dbInstance);
    });
  }).catch(error => {
    console.error(error.message);
    return null; // Return null if connection fails
  });

  if (!db) return; // Exit if DB connection failed

  // AUTOMATED BACKUP LOGIC 
  createBackup(DB_FILE_PATH, __dirname); 

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
      if (
        ["image/jpeg", "image/png", "image/gif"].includes(file.mimetype)
      ) {
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
      if (err) return console.error("Visitors Table Error (Fatal):", err.message);
      db.run(visitsSql, (err) => {
        if (err) return console.error("Visits Table Error (Fatal):", err.message);
        db.run(dependentsSql, (err) => {
          if (err) return console.error("Dependents Table Error (Fatal):", err.message);
          db.run(auditLogsSql, (err) => {
            if (err) return console.error("Audit Logs Table Error (Fatal):", err.message);
            
            // Running cleanup job.
            runDataComplianceCleanup(db); 

            // Router usage Attached only after DB is ready
            app.use("/", createRegistrationRouter(db,upload));
            app.use("/", createVisitorsRouter(db));
            app.use("/", createLoginRouter(db));
            app.use("/", createUpdateVisitorRouter(db));
            app.use("/", createLogoutRouter(db));
            app.use("/", createBanVisitorRouter(db));
            app.use("/", createUnbanVisitorRouter(db));
            app.use("/", createSearchVisitorsRouter(db)); 
            app.use("/", createMissedVisitRouter(db)); 
            app.use("/", createHistoryRouter(db));

            //  START LISTENING ONLY AFTER ALL DB WORK AND ROUTERS ARE ATTACHED
            app.listen(PORT, () => {
              console.log(`Server is running on http://localhost:${PORT}`);
            });
          });
        });
      });
    });
  });
};

// Execute the async initialization function
initializeServer();