const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';// backend endpoint
import * as Sentry from "@sentry/react";

/**
 * Global function to log client-side errors to the backend.
 * @param {Error} error - The JavaScript Error object.
 * @param {object} [info] - Component stack or other contextual info.
 * @param {string} type - The type of error (e.g., RENDER_CRASH, API_FAIL).
 */
export async function logClientError(error, info = {}, type = 'CLIENT_ERROR') {
  if (!error) return;
  const logData = {
    // Audit Log Table Mapping:
    event_name: type,
    timestamp: new Date().toISOString(),
    status: 'Failed', // Status for a client error/crash
    
    // Custom Client-side Details:
    client_message: error.message,
    client_stack: error.stack,
    client_info: JSON.stringify({
      ...info,
      url: window.location.href,
      userAgent: navigator.userAgent,
    }),
  };
  // PRINT JSON TO CONSOLE
  console.group(`🚨 [${type}] Application Error`);
  console.log(JSON.stringify(logData, null, 2)); 
  console.groupEnd();

// We check if the VITE_SENTRY_DSN exists before calling Sentry
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error, { extra: info });
  }
  try {
    // Send the data to  backend endpoint 
    await fetch(`${API_BASE_URL}/api/audit/log-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // send this data without blocking the main thread
      body: JSON.stringify(logData),
      //keepalive to ensure the request finishes even if the page closes
      keepalive: true, 
    });
    console.log(`Error logged to backend successfully: ${type}`);
  } catch (e) {
    // If logging fails, log to console as a fallback
    console.error('Failed to log error to backend:', e);
  }
}

export default logClientError;