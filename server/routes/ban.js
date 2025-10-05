const express = require("express");

/**
 * Creates and configures a router for handling visitor banning.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the ban endpoint.
 */
function createBanVisitorRouter(db) {
  const router = express.Router();

  // Endpoint to ban a visitor by updating their is_banned status to 1
  router.post("/ban-visitor/:id", (req, res) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Visitor ID is required." });
    }

    const sql = `UPDATE visitors SET is_banned = 1 WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) {
        console.error("SQL Error banning visitor:", err.message);
        return res.status(500).json({ error: err.message });
      }

      // Check if any rows were actually changed (if the visitor ID existed)
      if (this.changes === 0) {
        return res.status(404).json({ message: "Visitor not found." });
      }

      res.status(200).json({ message: `Visitor has been banned & sign it out.` });
    });
  });

  return router;
}

module.exports = createBanVisitorRouter;
