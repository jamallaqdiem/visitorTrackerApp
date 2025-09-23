const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const app = express();
const PORT = 3001;

const createRegistrationRouter = require("./auth/registration");
const createVisitorsRouter = require("./routes/visitors");
const createLoginRouter = require("./routes/login");
const createUpdateVisitorRouter = require("./routes/update_visitor_details");
const createLogoutRouter = require("./routes/logout");
const createBanVisitorRouter = require("./routes/ban");
const createUnbanVisitorRouter = require("./routes/unban");
const createExportRouter = require("./routes/export_visitor_data");

// Middleware setup
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve static images from the 'uploads' directory
app.use("/uploads", express.static("uploads"));

// Ensure the uploads directory exists
const uploadsDir = "uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
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
    fileSize: 20 * 1024 * 1024, // 20Mb size limit
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/gif"
    ) {
      cb(null, true); // accept
    } else {
      cb(
        new Error("Invalid file type, only JPEG, PNG, or GIF is allowed!"),
        false
      ); // reject
    }
  },
});

// Connect to SQLite database
const db = new sqlite3.Database("database.db", (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("Connected to the database.");
    // This is the visitors table
    db.run(`CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      photo_path TEXT,
      is_banned BOOLEAN DEFAULT 0
    )`);

    // This is the new visits table with all visit-specific details
    db.run(`CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id INTEGER NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      phone_number TEXT,
      unit TEXT NOT NULL,
      reason_for_visit TEXT,
      type TEXT NOT NULL,
      company_name TEXT,
      FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )`);

    // The dependents table is linked to the visits table
    db.run(`CREATE TABLE IF NOT EXISTS dependents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      age INTEGER,
      visit_id INTEGER NOT NULL,
      FOREIGN KEY (visit_id) REFERENCES visits(id)
    )`);
  }
});

app.use("/", createRegistrationRouter(db,upload));
app.use("/", createVisitorsRouter(db));
app.use("/", createLoginRouter(db));
app.use("/", createUpdateVisitorRouter(db));
app.use("/", createLogoutRouter(db));
app.use("/", createBanVisitorRouter(db));
app.use("/", createUnbanVisitorRouter(db));
app.use("/", createExportRouter(db));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
