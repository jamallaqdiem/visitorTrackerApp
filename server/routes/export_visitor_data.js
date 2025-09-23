const express = require("express");

/**
 * Creates and configures a router for exporting visitor data to a CSV format.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the export endpoint.
 */
function createExportRouter(db) {
  const router = express.Router();

  // Endpoint to handle the CSV export
  router.get("/export-visitors", (req, res) => {
    const { id } = req.query;

    if (!id) {
      return res.status(400).send("Visitor ID is required for export.");
    }

    const sql = `
      SELECT
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
        T2.type,
        GROUP_CONCAT(T3.full_name || ' (' || T3.age || ')', ', ') AS dependents_info_age
      FROM visitors AS T1
      LEFT JOIN visits AS T2 ON T1.id = T2.visitor_id
      LEFT JOIN dependents AS T3 ON T2.id = T3.visit_id
      WHERE T1.id = ?
      GROUP BY T2.id
      ORDER BY T2.entry_time DESC
    `;

    db.all(sql, [id], (err, rows) => {
      if (err) {
        console.error("SQL Error during export:", err.message);
        return res.status(500).json({ error: err.message });
      }

      if (rows.length === 0) {
        return res.status(200).send("No data to export.");
      }

      const headers = Object.keys(rows[0]).join(",");
      const csvRows = rows.map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      );

      const csvString = [headers, ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="visitor_${id}_data.csv"`
      );
      res.status(200).send(csvString);
    });
  });

  return router;
}

module.exports = createExportRouter;
