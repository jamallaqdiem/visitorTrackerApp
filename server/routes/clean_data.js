/**
 * Executes the data retention compliance cleanup job.
 * Deletes records older than 2 years from dependents, visits, and finally visitors.
 *
 * @param {import('sqlite3').Database} db The SQLite database instance.
 * * @param {object} logger - The logging instance injected for testing/production.
 */
async function runDataComplianceCleanup(db,logger) {
    
    // Custom dbRun helper to ensure the 'changes' property is always available, 
    const dbRun = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve({ changes: this.changes || 0 }); 
            });
        });
    };

    logger.info('--- Starting Data Retention Compliance Cleanup Job (Async/Await) ---');

    let deletedCounts = { dependents: 0, visits: 0, profiles: 0 };
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    let auditStatus = 'OK';
    let auditEvent = 'Compliance Cleanup Succeeded';
    let errorMessage = '';

    try {
        // --- 1. Deleting Dependents (where parent visit is old) ---
        const deleteDependentsSql = `
            DELETE FROM dependents
            WHERE visit_id IN (
                SELECT id FROM visits WHERE entry_time < ?
            );
        `;
        // The custom dbRun 
        const dependentResult = await dbRun(deleteDependentsSql, [twoYearsAgo]);
        deletedCounts.dependents = dependentResult.changes;
        logger.info(`Cleanup: Deleted ${deletedCounts.dependents} old dependent record(s).`);

        // --- 2. Deleting Visits (older than 2 years) ---
        const deleteVisitsSql = `DELETE FROM visits WHERE entry_time < ?`;
        const visitsResult = await dbRun(deleteVisitsSql, [twoYearsAgo]);
        deletedCounts.visits = visitsResult.changes;
        logger.info(`Cleanup: Deleted ${deletedCounts.visits} old visit record(s).`);

        // --- 3. Deleting Visitor Profiles (who have no remaining visits) ---
        const deleteVisitorsSql = `
            DELETE FROM visitors
            WHERE id NOT IN (SELECT visitor_id FROM visits)
            AND is_banned = 0;
        `;
        const visitorsResult = await dbRun(deleteVisitorsSql);
        deletedCounts.profiles = visitorsResult.changes;
        logger.info(`Cleanup: Deleted ${deletedCounts.profiles} inactive visitor profile(s).`);

    } catch (error) {
        auditStatus = 'ERROR';
        auditEvent = 'Compliance Cleanup Failed';
        errorMessage = error.message;
        logger.error(`Cleanup Error: ${errorMessage}`);
    } finally {
        logger.info('--- Data Retention Compliance Cleanup Job Complete ---');

        // --- 4. Writing Audit Log ---
        const auditLogSql = `
            INSERT INTO audit_logs (event_name, timestamp, status, profiles_deleted, visits_deleted, dependents_deleted)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const timestamp = new Date().toISOString();
        const auditParams = [
            auditEvent,
            timestamp,
            auditStatus,
            deletedCounts.profiles,
            deletedCounts.visits,
            deletedCounts.dependents
        ];

        try {
            await dbRun(auditLogSql, auditParams);
            logger.info(`Audit Log written successfully: ${auditEvent}.`);
        } catch (auditError) {
            logger.error('FATAL: Could not write audit log:', auditError.message);
        }
    }
}

module.exports = runDataComplianceCleanup;
