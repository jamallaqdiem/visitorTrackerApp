const express = require("express");

/**
 * Creates and configures a router for handling visitor search.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the search endpoint.
 */
function createSearchVisitorsRouter(db) {
  const router = express.Router();

  // Endpoint to search for visitors by name
  router.get("/visitor-search", (req, res) => {
    const searchTerm = req.query.name;
    if (!searchTerm) {
      return res.status(400).json({ message: "Search term 'name' is required." });
    }

    const searchTerms = searchTerm.split(' ');
    let query = `
      SELECT
        T1.id,
        T1.first_name,
        T1.last_name,
        T1.photo_path,
        T1.is_banned,
        T2.known_as,
        T2.address,
        T2.phone_number,
        T2.unit,
        T2.reason_for_visit,
        T2.company_name,
        T2.type,
        T2.mandatory_acknowledgment_taken,
        GROUP_CONCAT(json_object('full_name', T3.full_name, 'age', T3.age), ',') AS dependents_json
      FROM visitors AS T1
      LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY visitor_id ORDER BY entry_time DESC) as rn
        FROM visits
      ) AS T2 ON T1.id = T2.visitor_id AND T2.rn = 1
      LEFT JOIN dependents AS T3 ON T2.id = T3.visit_id
      WHERE `;
    
    // Add conditions for each search term
    const likeTerms = [];
    const conditions = searchTerms.map(term => {
      likeTerms.push(`%${term}%`);
      return `(T1.first_name LIKE ? OR T1.last_name LIKE ?)`;
    });

    query += conditions.join(' AND ');
    query += ` GROUP BY T1.id`;

    db.all(query, likeTerms.flatMap(term => [term, term]), (err, rows) => {
      if (err) {
        console.error("SQL Error in visitor-search:", err.message);
        return res.status(500).json({ error: err.message });
      }
      
      const resultsWithUrls = rows.map((row) => {
        let dependentsData = [];
        if (row.dependents_json) {
          try {
            dependentsData = JSON.parse(`[${row.dependents_json}]`);
          } catch (parseErr) {
            console.error("Failed to parse dependents JSON:", parseErr.message);
          }
        }
        
        return {
          ...row,
          photo_path: row.photo_path
            ? `${req.protocol}://${req.get("host")}/${row.photo_path}`
            : null,
          dependents: dependentsData,
        };
      });
      res.status(200).json(resultsWithUrls);
    });
  });

  return router;
}

module.exports = createSearchVisitorsRouter;
