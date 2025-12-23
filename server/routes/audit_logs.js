const express = require("express");
const router = express.Router();
const logger = require("../logger");
const { initializeDatabase } = require("../db_management");
const { updateStatus } = require("../status_tracker");

module.exports = (db, logger) => {
  /**
   * POST /api/audit/log-error
   * Endpoint to receive client-side error reports and log them to the audit_logs table.
   */
  router.post("/log-error", (req, res) => {
    // The data structure is defined in frontend error-logging.js utility
    const {
      event_name,
      timestamp,
      status,
      client_message,
      client_stack,
      client_info,
    } = req.body;

    if (!event_name || !timestamp || !status) {
      logger.warn("Received incomplete client error log data.");
      return res.status(400).send({ message: "Missing required log fields." });
    }

    const sql = `
            INSERT INTO audit_logs (
                event_name, 
                timestamp, 
                status, 
                profiles_deleted, 
                visits_deleted, 
                dependents_deleted
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;

    // Use the visitor_id from the client_info if available, or 0/null if not
    const params = [
      event_name,
      timestamp,
      status,
      0, // profiles_deleted (Not applicable for client errors)
      0, // visits_deleted (Not applicable for client errors)
      0, // dependents_deleted (Not applicable for client errors)
    ];

    // Execute the insertion
    db.run(sql, params, function (err) {
      if (err) {
        // If logging fails, log the failure but still send 200/202 to the client
        // so the client's error handling doesn't get stuck in a loop.
        logger.error(
          `Failed to insert client error into audit_logs: ${err.message}`,
          {
            client_error: { client_message, client_stack, client_info },
          }
        );
        // Use 202 Accepted, regardless of success.
        return res
          .status(202)
          .send({
            message: "Log request accepted, but backend insertion failed.",
          });
      }
      // This pushes the message "API_VISITORS_FAIL" directly to the Health Widget
      updateStatus("last_error", `Client Crash: ${event_name}`);
      
      // Get only the first 2 or 3 lines of the stack trace
      const shortStack = client_stack
        ? client_stack.split("\n").slice(0, 3).join("\n")
        : "No stack trace";
      logger.info(
        `[ID: ${this.lastID}] ${event_name}: ${client_message}\n${shortStack}`
      );
      return res
        .status(201)
        .send({ message: "Client error logged successfully", id: this.lastID });
    });
  });

  return router;
};
