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
        T2.phone_number,
        T2.unit,
        T2.reason_for_visit,
        T2.type,
        T2.company_name,
        GROUP_CONCAT(json_object('full_name', T3.full_name, 'age', T3.age), ',') AS dependents_json
      FROM visitors AS T1
      LEFT JOIN visits AS T2
        ON T1.id = T2.visitor_id
      LEFT JOIN dependents AS T3
        ON T2.id = T3.visit_id
      WHERE T1.id = ?
      GROUP BY T1.id
      ORDER BY T2.entry_time DESC
      LIMIT 1
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

      // Step 2: Insert a new visit record.
      const insertSql = `
        INSERT INTO visits (visitor_id, entry_time, phone_number, unit, reason_for_visit, type, company_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        id,
        entry_time,
        row.phone_number,
        row.unit,
        row.reason_for_visit,
        row.type,
        row.company_name,
      ];

      db.run(insertSql, params, function (err) {
        if (err) {
          console.error("SQL Error inserting new visit:", err.message);
          return res.status(500).json({ error: err.message });
        }
        // Step 3: Respond with the retrieved data.
        let dependentsData = [];
        if (row.dependents_json) {
          try {
            dependentsData = JSON.parse(`[${row.dependents_json}]`);
          } catch (parseErr) {
            console.error("Failed to parse dependents JSON:", parseErr.message);
          }
        }

        const visitorData = {
          ...row,
          id: id,
          is_banned: row.is_banned,
          dependents: dependentsData,
        };

        res.status(200).json({
          message: "Visitor logged in successfully!",
          visitorData: visitorData,
        });
      });
    });
  });

  return router;
}

module.exports = createLoginRouter;
