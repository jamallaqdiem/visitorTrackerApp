const express = require("express");

/**
 * Creates and configures a router for handling visitor login.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the login endpoint.
 */
function createLoginRouter(db) {
  const router = express.Router();

  // Endpoint for an existing visitor to log in
  router.post("/login", (req, res) => {
    const { id } = req.body;
    const entry_time = new Date().toISOString();

    // Step 1: Find the last visit's details, including dependents.
    const findSql = `
      SELECT
        T1.id,
        T1.is_banned,
        T2.known_as,
        T2.address,
        T2.phone_number,
        T2.unit,
        T2.reason_for_visit,
        T2.type,
        T2.company_name,
        T2.mandatory_acknowledgment_taken,
        GROUP_CONCAT(json_object('full_name', T3.full_name, 'age', T3.age), ',') AS dependents_json
        FROM visitors AS T1 
    LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY visitor_id ORDER BY entry_time DESC) as rn
        FROM visits
    ) AS T2 
        ON T1.id = T2.visitor_id AND T2.rn = 1
    LEFT JOIN dependents AS T3
        ON T2.id = T3.visit_id
    WHERE T1.id = ?
    GROUP BY T1.id
    `;

    db.get(findSql, [id], (err, row) => {
      if (err) {
        console.error("SQL Error in login:", err.message);
        return res.status(500).json({ error: err.message });
      }

      if (!row) {
        return res.status(404).json({ message: "Visitor not found." });
      }
      if (row.is_banned === 1) {
        return res
          .status(403)
          .json({ message: "This visitor is banned and cannot log in." });
      }

      let dependentsData = [];
      if (row.dependents_json) {
        try {
          dependentsData = JSON.parse(`[${row.dependents_json}]`);
          dependentsData = dependentsData.filter(
            (dep) => dep.full_name && dep.full_name.trim() !== ""
          );
        } catch (parseErr) {
          console.error(
            "Failed to parse dependents JSON for insertion:",
            parseErr.message
          );
        }
      }
      // Step 2: Insert a new visit record.
      const insertSql = `
        INSERT INTO visits (visitor_id, entry_time, known_as, address, phone_number, unit, reason_for_visit, type, company_name, mandatory_acknowledgment_taken)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        id,
        entry_time,
        row.known_as,
        row.address,
        row.phone_number,
        row.unit,
        row.reason_for_visit,
        row.type,
        row.company_name,
        row.mandatory_acknowledgment_taken,
      ];

      db.run(insertSql, params, function (err) {
        if (err) {
          console.error("SQL Error inserting new visit:", err.message);
          return res.status(500).json({ error: err.message });
        }
        const newVisitId = this.lastID; // Get the ID of the newly created visit

        if (dependentsData.length > 0) {
          const dependentInsertSql = `
						INSERT INTO dependents (visit_id, full_name, age)
						VALUES (?, ?, ?)
					`;

          dependentsData.forEach((dep) => {
            db.run(
              dependentInsertSql,
              [newVisitId, dep.full_name, dep.age],
              (depErr) => {
                if (depErr) {
                  console.error(
                    "SQL Error inserting dependent:",
                    depErr.message
                  );
                }
              }
            );
          });
        }

        const visitorData = {
          ...row,
          id: id,
          is_banned: row.is_banned,
          dependents: dependentsData,
        };

        res.status(200).json({
          message: "Visitor signed in successfully!",
          visitorData: visitorData,
        });
      });
    });
  });

  return router;
}

module.exports = createLoginRouter;
