const express = require("express");

/**
 * Creates and configures a router for handling visitor-related data.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the visitor endpoints.
 */
function createVisitorsRouter(db) {
  const router = express.Router();

  // Endpoint to get all currently signed-in visitors
  router.get("/visitors", (req, res) => {
  const query = `
    SELECT
      T1.id,
      T1.first_name,
      T1.last_name,
      T1.photo_path,
      T1.is_banned,
      T2.entry_time,
      T2.exit_time,
      T2.phone_number,
      T2.unit,
      T2.reason_for_visit,
      T2.company_name,
      T2.type
    FROM visitors AS T1
    JOIN visits AS T2
    ON T1.id = T2.visitor_id
    WHERE T2.exit_time IS NULL
    ORDER BY T2.entry_time DESC
  `;
    db.all(query, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const resultsWithUrls = rows.map((row) => ({
        ...row,
        photo: row.photo_path
          ? `${req.protocol}://${req.get("host")}/${row.photo_path}`
          : null,
      }));
      res.json(resultsWithUrls);
    });
  });

  return router;
}

module.exports = createVisitorsRouter;
