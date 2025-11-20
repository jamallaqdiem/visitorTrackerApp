const express = require("express");
require('dotenv').config();

/**
 * Creates and configures a router for handling visitor unbanning.
 * This endpoint requires a master password for authorization.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the unban endpoint.
 */
function createUnbanVisitorRouter(db) {
  const router = express.Router();

  // Endpoint to unban a visitor
  router.post("/unban-visitor/:id", (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    // Use the master password from the secure .env file
    const masterPassword = process.env.MASTER_PASSWORD ? process.env.MASTER_PASSWORD.trim()
    : null;

    // Check if the provided password matches the secure one
    if (password !== masterPassword) {
      return res.status(403).json({ message: "Incorrect password." });
    }

    const sql = `UPDATE visitors SET is_banned = 0 WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) {
        console.error("SQL Error unbanning visitor:", err.message);
        return res.status(500).json({ error: err.message });
      }

      // Check if any rows were actually changed (... the visitor ID existed)
      if (this.changes === 0) {
        return res.status(404).json({ message: "Visitor not found." });
      }

      res.status(200).json({ message: `Visitor has been unbanned successfully.` });
    });
  });

  return router;
}

module.exports = createUnbanVisitorRouter;
