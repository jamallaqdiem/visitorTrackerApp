const appStatus = {
    // True if DB connection and initial integrity check passed
    db_ready: false, 
    // Latest time a successful backup was created
    last_backup: 'N/A', 
    // Latest time the data cleanup job successfully completed
    last_cleanup: 'N/A', 
    // Used to log the last severe error message (null if OK)
    last_error: null 
};

// Function to update any status field
function updateStatus(key, value) {
    appStatus[key] = value;
}

// Function to get the full status object
function getStatus() {
    return appStatus;
}

module.exports = {
    updateStatus,
    getStatus
};