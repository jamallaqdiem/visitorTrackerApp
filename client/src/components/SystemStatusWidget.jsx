import React, { useState, useEffect, useCallback } from "react";

// Helper component for the table rows
const StatusLine = ({ label, value, isGood }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-gray-50 text-xs">
    <span className="text-gray-500 font-medium">{label}</span>
    <span className={`font-bold ${isGood ? 'text-green-600' : 'text-red-600'}`}>
      {value}
    </span>
  </div>
);

const SystemStatusWidget = () => {
  const [status, setStatus] = useState({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // 1. Fetch System Status
  const fetchStatus = useCallback(async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
    
    const response = await fetch(`${API_BASE_URL}/api/status`);
      if (!response.ok) throw new Error("Status API unreachable");
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Fetch error:", error);
      setStatus({ 
        db_ready: false, 
        last_error: error.message || "Connection Refused" 
      });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 15000); // Refresh every 15s
    return () => clearInterval(intervalId);
  }, [fetchStatus]);

  // 2. Prepare the full Diagnostic Data object
  const fullDiagnosticData = {
    timestamp: new Date().toISOString(),
    status: status,
    client: {
      url: window.location.href,
      agent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`
    }
  };

  // 3. Copy Handler
  const handleCopyToClipboard = async () => {
    try {
      // Stringify with (null, 2) to keep the JSON formatting (indents)
      const textToCopy = JSON.stringify(fullDiagnosticData, null, 2);
      await navigator.clipboard.writeText(textToCopy);
      alert("Full Diagnostic Data copied to clipboard!");
    } catch (err) {
      alert("Failed to copy. Please select the text manually.");
    }
  };

  return (
    <>
      {/* --- FLOATING WIDGET --- */}
      <div className="fixed bottom-4 right-4 w-72 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden z-40 transition-all">
        {/* Header - Toggles expansion */}
        <div 
          className="bg-gray-800 text-white p-3 flex justify-between items-center cursor-pointer hover:bg-gray-700"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 className="text-sm font-bold flex items-center">
            <span className={`w-2.5 h-2.5 rounded-full mr-2 ${status.db_ready ? 'bg-green-500' : 'bg-red-500'}`}></span>
            System Health
          </h3>
          <span className="text-xs font-mono">{isExpanded ? 'Collapse ▲' : 'Expand ▼'}</span>
        </div>

        {/* Expandable Table Content */}
        {isExpanded && (
          <div className="p-4 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <StatusLine 
              label="Database" 
              value={status.db_ready ? "Operational" : "Error"} 
              isGood={status.db_ready} 
            />
            <StatusLine 
              label="Last Backup" 
              value={status.last_backup ? new Date(status.last_backup).toLocaleTimeString() : "N/A"} 
              isGood={!!status.last_backup} 
            />

            {status.last_error && (
              <div className="mt-2 p-2 bg-red-50 text-red-600 text-[10px] rounded border border-red-100 break-words">
                <strong>Error:</strong> {status.last_error}
              </div>
            )}

            <button 
              onClick={() => setShowModal(true)}
              className="mt-4 w-full py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition shadow-sm"
            >
              VIEW FULL DIAGNOSTICS
            </button>
          </div>
          
        )}

      </div>

      {/* --- DIAGNOSTIC MODAL --- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 border border-gray-300">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Diagnostic Data</h2>
              <button 
                onClick={() => setShowModal(false)} 
                className="text-gray-400 hover:text-black text-xl"
              >
              </button>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
              Copy this JSON and send it to the support team for troubleshooting.
            </p>
            
            {/* Dark JSON Display Area */}
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-80 shadow-inner">
              <pre>{JSON.stringify(fullDiagnosticData, null, 2)}</pre>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button 
                className="px-4 py-2 bg-gray-100 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-200"
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition"
                onClick={handleCopyToClipboard}
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SystemStatusWidget;