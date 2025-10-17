const express = require("express");

/**
 * Creates and configures a router for handling visitor sign-out.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the sign-out endpoint.
 */
function createLogoutRouter(db) {
  const router = express.Router();

  // Endpoint to log out a visitor by setting their exit time
  router.post("/exit-visitor/:id", (req, res) => {
    const { id } = req.params;
    const exit_time = new Date().toISOString();

    // Find the single active visit to update for this visitor
    const findSql =
      "SELECT T1.id AS visit_id, T2.first_name, T2.last_name FROM visits T1 JOIN visitors T2 ON T1.visitor_id = T2.id WHERE T1.visitor_id = ? AND T1.exit_time IS NULL ORDER BY T1.entry_time DESC LIMIT 1";
    db.get(findSql, [id], (err, row) => {
      if (err) {
        console.error("SQL Error in exit-visitor:", err.message);
        return res.status(500).json({ error: err.message });
      }

      // If no active visit is found, return a 404
      if (!row) {
        return res
          .status(404)
          .json({ message: "Visitor not found or already signed out." });
      }

      const updateSql = `UPDATE visits SET exit_time = ? WHERE id = ?`;
      db.run(updateSql, [exit_time, row.visit_id], function (err) {
        if (err) {
          console.error("SQL Error in exit-visitor:", err.message);
          return res.status(500).json({ error: err.message });
        }
        const fullName = `${row.first_name} ${row.last_name}`;
        res
          .status(200)
          .json({ message: `${fullName} has been successfully signed out.` });
      });
    });
  });

  return router;
}

module.exports = createLogoutRouter;
