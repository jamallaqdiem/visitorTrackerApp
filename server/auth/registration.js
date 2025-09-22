const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

/**
 * Creates and configures a router for handling new visitor registrations.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the registration endpoint.
 */
function createRegistrationRouter(db) {
  const router = express.Router();

  // Ensure the uploads directory exists
  const uploadsDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
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
      fileSize: 5 * 1024 * 1024, // 5Mb size limit
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

  // Handle visitor registration
  router.post("/", upload.single("photo"), (req, res) => {
    const {
      first_name,
      last_name,
      phone_number,
      unit,
      reason_for_visit,
      type,
      company_name,
      additional_dependents,
    } = req.body;
    const photo_path = req.file ? path.basename(req.file.path) : null;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION;");

      const visitorSql = `INSERT INTO visitors (first_name, last_name, photo_path) VALUES (?, ?, ?)`;
      db.run(visitorSql, [first_name, last_name, photo_path], function (err) {
        if (err) {
          db.run("ROLLBACK;");
          return res.status(500).json({ error: err.message });
        }
        const visitorId = this.lastID;

        const visitsSql = `
          INSERT INTO visits (
            visitor_id, entry_time, phone_number, unit, reason_for_visit, type, company_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const entry_time = new Date().toISOString();
        db.run(
          visitsSql,
          [
            visitorId,
            entry_time,
            phone_number,
            unit,
            reason_for_visit,
            type,
            company_name,
          ],
          function (err) {
            if (err) {
              db.run("ROLLBACK;");
              return res.status(500).json({ error: err.message });
            }
            const visitId = this.lastID;

            if (additional_dependents) {
              let dependentsArray = [];
              try {
                dependentsArray = JSON.parse(additional_dependents);
              } catch (parseError) {
                db.run("ROLLBACK;");
                return res.status(400).json({ error: "Invalid dependents JSON format." });
              }

              if (dependentsArray.length > 0) {
                const dependentPromises = dependentsArray.map(
                  (dependent) =>
                    new Promise((resolve, reject) => {
                      db.run(
                        `INSERT INTO dependents (full_name, age, visit_id) VALUES (?, ?, ?)`,
                        [dependent.full_name, dependent.age, visitId],
                        function (err) {
                          if (err) reject(err);
                          else resolve();
                        }
                      );
                    })
                );

                Promise.all(dependentPromises)
                  .then(() => {
                    db.run("COMMIT;");
                    res.status(201).json({ message: "Visitor registered successfully!", id: visitorId });
                  })
                  .catch((promiseErr) => {
                    db.run("ROLLBACK;");
                    res.status(500).json({ error: "Failed to save dependents.", detail: promiseErr.message });
                  });
              } else {
                db.run("COMMIT;");
                res.status(201).json({ message: "Visitor registered successfully!", id: visitorId });
              }
            } else {
              db.run("COMMIT;");
              res.status(201).json({ message: "Visitor registered successfully!", id: visitorId });
            }
          }
        );
      });
    });
  });

  // Centralized error handler for the router. Catches errors from multer.
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred (e.g., file too large).
      return res.status(400).json({ error: err.message });
    } else if (err) {
      // A custom error occurred (e.g., our fileFilter rejection).
      return res.status(400).json({ error: err.message });
    }
    next();
  });

  return router;
}

module.exports = createRegistrationRouter;
