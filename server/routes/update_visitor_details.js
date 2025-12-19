const express = require("express");

/**
 * Creates and configures a router for handling visitor data updates for a returning visitor.
 *
 * @param {object} db - The SQLite database instance.
 * @param {object} logger - The logging instance injected for testing/production.
 * @returns {express.Router} - An Express router with the update endpoint.
 */
function createUpdateVisitorRouter(db, logger) {
  const router = express.Router();

  // Endpoint to handle visitor data updates (new visit) for a returning visitor
  router.post("/update-visitor-details", (req, res) => {
    const {
      id,
      known_as,
      address,
      phone_number,
      unit,
      reason_for_visit,
      type,
      company_name,
      mandatory_acknowledgment_taken,
      additional_dependents,
    } = req.body;

    if (!id) {
      logger.warn(
        "Re-registration attempted without Visitor ID (400 Bad Request)."
      );
      return res
        .status(400)
        .json({ message: "Visitor ID is required for re-registration." });
    }
    // Use a transaction
    db.run("BEGIN TRANSACTION;");

    // First, verify the visitor ID exists in the system
    db.get("SELECT id FROM visitors WHERE id = ?", [id], (err, visitorRow) => {
      if (err) {
        db.run("ROLLBACK;");
        logger.error(`SQL Error checking visitor ID ${id}:`, err.message);
        return res.status(404).json({ message: "Visitor ID not found." });
      }

      if (!visitorRow) {
        // SCENARIO B: Visitor ID not found
        db.run("ROLLBACK;");
        logger.warn(
          `Visitor re-registration failed: ID ${id} not found (404).`
        ); // Log the ID not found as a WARN
        return res.status(404).json({ message: "Visitor ID not found." });
      }

      // Insert a new visit record.
      const visitsSql = `
          INSERT INTO visits (
            visitor_id, entry_time, known_as, address, phone_number, unit, reason_for_visit, type, company_name, mandatory_acknowledgment_taken
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const entry_time = new Date().toISOString();

      db.run(
        visitsSql,
        [
          id, // Use the existing visitor ID
          entry_time,
          known_as,
          address,
          phone_number,
          unit,
          reason_for_visit,
          type,
          company_name,
          mandatory_acknowledgment_taken,
        ],
        function (err) {
          if (err) {
            db.run("ROLLBACK;");
            logger.error("SQL Error inserting new visit:", err.message);
            return res.status(500).json({ error: err.message });
          }
          const newVisitId = this.lastID;

          // handle dependents and link them to the NEW visit record
          if (additional_dependents) {
            let dependentsArray = [];
            try {
              dependentsArray = JSON.parse(additional_dependents);
            } catch (parseError) {
              logger.error(
                "Failed to parse dependents JSON. Treating as single dependent.",
                parseError
              );
              // Fallback for non-JSON dependent string
              dependentsArray = [
                { full_name: additional_dependents, age: null },
              ];
            }

            if (dependentsArray.length > 0) {
              const dependentPromises = dependentsArray.map(
                (dependent) =>
                  new Promise((resolve, reject) => {
                    db.run(
                      `INSERT INTO dependents (full_name, age, visit_id) VALUES (?, ?, ?)`,
                      [dependent.full_name, dependent.age, newVisitId],
                      function (err) {
                        if (err) {
                          reject(err);
                        } else {
                          resolve();
                        }
                      }
                    );
                  })
              );

              Promise.all(dependentPromises)
                .then(() => {
                  db.run("COMMIT;");
                  // ✅ FIX 1: Add logger.info for success with dependents
                  logger.info(`Visitor re-registered successfully with ${dependentsArray.length} dependents (Visit ID: ${newVisitId}, Visitor ID: ${id})`);
                  res.status(201).json({
                    message: "Visitor Updated Successfully!",
                    id: newVisitId,
                  });
                })
                .catch((err) => {
                  logger.error("Error inserting dependent:", err.message);
                  db.run("ROLLBACK;");
                  res.status(500).json({ error: "Transaction failed." });
                });
            } else {
              db.run("COMMIT;");
              // ✅ FIX 2: Add logger.info for success without dependents (if JSON parsed to an empty array)
              logger.info(`Visitor re-registered successfully (Visit ID: ${newVisitId}, Visitor ID: ${id})`);
              res.status(201).json({
                message: "Visitor Updated Successfully & signed in!",
                id: newVisitId,
              });
            }
          } else {
            db.run("COMMIT;");
            // ✅ FIX 3: Add logger.info for success without dependents (if additional_dependents was falsy)
            logger.info(`Visitor re-registered successfully (Visit ID: ${newVisitId}, Visitor ID: ${id})`);
            res.status(201).json({
              message: "Visitor Updated Successfully & signed in!",
              id: newVisitId,
            });
          }
        }
      );
    });
  });

  return router;
}

module.exports = createUpdateVisitorRouter;