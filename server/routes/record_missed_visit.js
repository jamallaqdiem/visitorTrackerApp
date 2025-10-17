const express = require("express");

/**
 * Creates and configures a router for handling historical visit corrections.
 * This is used when a visitor was missed on sign-in and is now leaving.
 * The process first retrieves the details of the visitor's last visit
 * to populate fields like unit, phone, and type, and then records a new
 * visit with the historical entry time and the current exit time.
 *
 * @param {object} db - The SQLite database instance.
 * @returns {express.Router} - An Express router with the correction endpoint.
 */
function createMissedVisitRouter(db) {
    const router = express.Router();

    // Endpoint: POST /record-missed-visit
    // Body expected: { visitorId: 1, pastEntryTime: "YYYY-MM-DDTHH:MM:SSZ" }
    router.post("/record-missed-visit", (req, res) => {
        // 1. Extract data from the request body
        const { visitorId, pastEntryTime } = req.body;
        if (!visitorId || !pastEntryTime) {
            return res.status(400).json({ message: "Missing visitor ID or required entry time." });
        }

        // 3. Set the Exit Time to the current server time and validate entry time
        const currentExitTime = new Date().toISOString();
        const entryDate = new Date(pastEntryTime);
        const exitDate = new Date(currentExitTime);

        // Check if the date is valid and if the entry time occurs before the current exit time
        if (isNaN(entryDate.getTime()) || entryDate >= exitDate) {
            return res.status(400).json({ 
                message: "Invalid entry time. It must be a valid date/time and occur before the current exit time." 
            });
        }
        
        const entry_time_iso = entryDate.toISOString();

        // 4. Step 1: Find the details of the visitor's most recent visit.
        const selectSql = `
            SELECT 
                known_as, address, phone_number, unit, reason_for_visit, type, company_name 
            FROM visits 
            WHERE visitor_id = ? 
            ORDER BY entry_time DESC 
            LIMIT 1
        `;

        db.get(selectSql, [visitorId], (err, lastVisit) => {
            if (err) {
                console.error("SQL Error during SELECT in /record-missed-visit:", err.message);
                return res.status(500).json({ error: "Database error during lookup: " + err.message });
            }

            // Use details from the last visit, or fall back to defaults if no previous record exists
            const visitDetails = lastVisit || {};
            const knownAs = visitDetails.known_as || '--';
            const address1 = visitDetails.address || '--';
            const phoneNumber = visitDetails.phone_number || null;
            const unit = visitDetails.unit || "--"; 
            const reasonForVisit = visitDetails.reason_for_visit || null;
            const type = visitDetails.type || "Visitor"; 
            const companyName = visitDetails.company_name || null;

            // 5. Step 2: Insert the new historical record
            const insertSql = `
                INSERT INTO visits (
                    visitor_id, entry_time, exit_time, known_as, address, phone_number, unit, reason_for_visit, type, company_name
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(insertSql, 
                [
                    visitorId, 
                    entry_time_iso, 
                    currentExitTime,
                    knownAs,
                    address1, 
                    phoneNumber, 
                    unit, 
                    reasonForVisit, 
                    type, 
                    companyName
                ], 
                function (err) {
                    if (err) {
                        // Log and return 500 status on database failure (e.g., foreign key violation)
                        console.error("SQL Error during INSERT in /record-missed-visit:", err.message);
                        return res.status(500).json({ error: "Failed to record historical visit due to database error: " + err.message });
                    }

                    // Success response
                    res.status(200).json({
                        message: "Visitor Entry Time Corrected & Sing it Out",
                        entry: entry_time_iso,
                        exit: currentExitTime
                    });
                }
            );
        });
    });

    return router;
}

module.exports = createMissedVisitRouter;
