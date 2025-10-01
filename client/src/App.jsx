import React, { useState, useEffect, useCallback, useRef } from "react";
import VisitorsDashboard from "./components/VisitorsDashboard";
import VisitorDetailsForm from "./components/VisitorDetailsForm";
import VisitorRegistrationForm from "./components/VisitorRegistrationForm";
import PasswordModal from "./components/PasswordModal";

const API_BASE_URL = "http://localhost:3001";

// Initial state for the registration form
const initialRegistrationForm = {
  firstName: "",
  lastName: "",
  phoneNumber: "",
  unit: "",
  reasonForVisit: "",
  visitorType: "visitor",
  company_name: "",
  photo: null,
};

function App() {
  // --- Global State & Loading ---
  const [visitors, setVisitors] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingRegistration, setLoadingRegistration] = useState(false);

  // --- UI/Mode State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [showRegistration, setShowRegistration] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState(null);

  // --- Registration Form State ---
  const [regFormData, setRegFormData] = useState(initialRegistrationForm);
  const [regDependents, setRegDependents] = useState([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

  // --- Visitor Details/Update Form State ---
  const [editFormData, setEditFormData] = useState({});

  // --- Notification State (Global for forms and dashboard) ---
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // --- Unban Modal State ---
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [unbanVisitorId, setUnbanVisitorId] = useState(null);
  const [unbanPassword, setUnbanPassword] = useState("");
  const [showUnbanPassword, setShowUnbanPassword] = useState(false);

  // Debounce for live search
  const debounceTimeoutRef = useRef(null);

  // Helper function for showing a transient message
  const showNotification = (msg, type = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  // --- API: Fetch Currently Signed-In Visitors (5-second refresh logic) ---
  const fetchVisitors = useCallback(async () => {
    // Only show loading indicator initially or when explicitly triggered
    if (visitors.length === 0) setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/visitors`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setVisitors(data);
    } catch (err) {
      console.error("Error fetching visitors:", err);
      setError("Failed to load active visitors.");
      setVisitors([]);
    } finally {
      setIsLoading(false);
    }
  }, [visitors.length]);

  // EFFECT: Auto-refresh "Who is On Site" table every 5 seconds
  useEffect(() => {
    // Fetch immediately on mount
    fetchVisitors();

    // Set up interval for refreshing every 5000ms
    const intervalId = setInterval(fetchVisitors, 5000);

    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [fetchVisitors]);

  // --- API: Visitor Search (Live Search with Debounce) ---
  const handleVisitorSearch = useCallback(async (term) => {
    const trimmedTerm = term.trim();
    setSearchResults([]);
    setSelectedVisitor(null);

    if (!trimmedTerm) {
      setIsLoading(false);
      setShowRegistration(false);
      return;
    }

    setIsLoading(true);

    try {
      const encodedSearchTerm = encodeURIComponent(trimmedTerm);
      const url = `${API_BASE_URL}/visitor-search?name=${encodedSearchTerm}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to perform visitor search.");
      }

      setSearchResults(data);
      if (data.length === 0) {
        showNotification("No visitor found. Please register.", "error");
        setShowRegistration(true); // Auto-redirect to registration
      } else {
        showNotification("Visitor(s) found. Select one to log in.", "success");
        setShowRegistration(false);
      }
    } catch (err) {
      console.error("Search Error:", err.message);
      showNotification(`Search Failed: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearchInput = useCallback((e) => {
    const term = e.target.value;
    setSearchTerm(term);

    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set a new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      handleVisitorSearch(term);
    }, 600); // 500ms debounce
  }); 

  // --- Visitor Selection Handler ---
  const handleVisitorSelect = (visitor) => {
    setSelectedVisitor(visitor);
    // Prepare edit form data
    setEditFormData({
      id: visitor.id,
      phone_number: visitor.phone_number || "",
      unit: visitor.unit || "",
      reason_for_visit: visitor.reason_for_visit || "",
      type: visitor.type || "visitor",
      company_name: visitor.company_name || "",
      // Ensure dependents is an array, parsing if stored as JSON string
      additional_dependents:
        visitor.dependents && Array.isArray(visitor.dependents)
          ? visitor.dependents // Use the new, fetched array.
          : (typeof visitor.additional_dependents === "string"
              ? JSON.parse(visitor.additional_dependents) // Fallback for old JSON string format
              : visitor.additional_dependents) || [],
      // FIX ENDS HERE
    });
    setSearchResults([]);
    setSearchTerm("");
    setShowRegistration(false); // Hide registration if it was shown
    showNotification("Visitor details loaded.", "blue");
  };

  // --- Cancel/Back to Dashboard Handler ---
  const handleCancelAction = () => {
    setSelectedVisitor(null);
    setSearchResults([]);
    setSearchTerm("");
    setShowRegistration(false);
    showNotification("Action cancelled. Back to dashboard.", "blue");
  };

  // --- Registration Handlers (Proxy functions for component) ---
  const handleRegInputChange = (e) => {
    const { name, value } = e.target;
    setRegFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRegFormData((prev) => ({ ...prev, photo: file }));
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleAddDependent = () => {
    setRegDependents((prev) => [...prev, { full_name: "", age: "" }]);
  };

  const handleRemoveDependent = (index) => {
    setRegDependents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDependentChange = (index, e) => {
    const { name, value } = e.target;
    const newDependents = regDependents.map((dep, i) => {
      if (i === index) {
        return {
          ...dep,
          [name]: name === "age" ? parseInt(value) || "" : value,
        };
      }
      return dep;
    });
    setRegDependents(newDependents);
  };

  const handleNewVisitorRegistration = async (e) => {
    e.preventDefault();
    if (loadingRegistration) return;

    setLoadingRegistration(true);

    const formData = new FormData();
    formData.append("first_name", regFormData.firstName);
    formData.append("last_name", regFormData.lastName);
    formData.append("phone_number", regFormData.phoneNumber);
    formData.append("unit", regFormData.unit);
    formData.append("reason_for_visit", regFormData.reasonForVisit);
    formData.append("type", regFormData.visitorType);
    formData.append("company_name", regFormData.company_name);

    if (regFormData.photo) {
      formData.append("photo", regFormData.photo);
    }

    const validDependents = regDependents.filter(
      (dep) => dep.full_name.trim() !== ""
    );
    if (validDependents.length > 0) {
      formData.append("additional_dependents", JSON.stringify(validDependents));
    }

    try {
      const response = await fetch(`${API_BASE_URL}/register-visitor`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to register new visitor.");
      }

      setMessage("Visitor logged in successfully!");
      setMessageType("success");

      setTimeout(() => {
        setMessage(null);
      }, 3000);

      // Reset form state and UI
      setRegFormData(initialRegistrationForm);
      setRegDependents([]);
      setPhotoPreviewUrl(null);
      handleCancelAction(); // Go back to dashboard

      fetchVisitors(); // Refresh the list
    } catch (err) {
      console.error("Registration Error:", err.message);
      showNotification(`Registration Failed: ${err.message}`, "error");
    } finally {
      setLoadingRegistration(false);
    }
  };

  // --- VisitorDetailsForm Handlers ---

  // 1. Log In (Check-in existing visitor with minimal details)
  const handleLogin = async (id) => {
    if (!id || !selectedVisitor) return;

    if (selectedVisitor.is_banned === 1) {
      showNotification(
        "Visitor is banned and cannot check in. Please unban first.",
        "error"
      );
      return;
    }
    // Check if the visitor is already signed in (if their ID exists in the active visitors list)
    const isAlreadySignedIn = visitors.some(
      (activeVisitor) => activeVisitor.id === id
    );

    if (isAlreadySignedIn) {
      showNotification(
        `${selectedVisitor.first_name} is already signed in! Cannot log in again.`,
        "error"
      );
      return; // Stop execution if they are already active
    }

    // NOTE: Using a custom modal is better, but following the mandate to avoid alert(), we use window.confirm() for now.

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed.");
      }

      showNotification(result.message, "success");
      setTimeout(() => {
        handleCancelAction(); // Go back to dashboard
        fetchVisitors();
      }, 3000); // Wait 2 seconds before navigating
    } catch (err) {
      console.error("Login Error:", err.message);
      showNotification(`Login Failed: ${err.message}`, "error");
    }
  };

  // 2. Update Details & Log In (Re-register)
  const handleUpdateAndLogin = async () => {
    if (!selectedVisitor) return;

    if (selectedVisitor.is_banned === 1) {
      showNotification(
        "Visitor is banned and cannot check in. Please unban first.",
        "error"
      );
      return;
    }
    // Check if the visitor is already signed in before allowing the update & log-in.
    const isAlreadySignedIn = visitors.some(
      (activeVisitor) => activeVisitor.id === selectedVisitor.id
    );

    if (isAlreadySignedIn) {
      showNotification(
        `${selectedVisitor.first_name} is already signed in! Sign them out first to log in again.`,
        "error"
      );

      return; // Stop execution if they are already active
    }
    // --- FIX: Filter out any dependent entries where the name is empty or just whitespace ---
    const cleanedDependents = (editFormData.additional_dependents || [])
        .filter(dep => dep.full_name && dep.full_name.trim() !== '');
    const dataToSend = {
      id: selectedVisitor.id,
      phone_number: editFormData.phone_number,
      unit: editFormData.unit,
      reason_for_visit: editFormData.reason_for_visit,
      type: editFormData.type,
      company_name: editFormData.company_name,
      additional_dependents: JSON.stringify(cleanedDependents),
    };

    try {
      const response = await fetch(`${API_BASE_URL}/update-visitor-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Update and Login failed.");
      }

      showNotification(
        result.message 
      );
      setTimeout(() => {
        handleCancelAction(); // Go back to dashboard
        fetchVisitors();
      }, 2000);
    } catch (err) {
      console.error("Update & Login Error:", err.message);
      showNotification(`Update & Login Failed: ${err.message}`, "error");
    }
  };

  // 3. Ban Visitor
  const handleBan = async (id) => {
    if (!id) return;
    // NOTE: Using a custom modal is better, but following the mandate to avoid alert(), we use window.confirm() for now.

    try {
      const response = await fetch(`${API_BASE_URL}/ban-visitor/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to ban visitor.");
      }

      showNotification(result.message, "error");
      setSelectedVisitor((prev) => (prev ? { ...prev, is_banned: 1 } : null)); // Update local state
            setTimeout(() => {
        handleCancelAction(); // Go back to dashboard
        fetchVisitors();
      }, 3000); // Wait 2 seconds before navigating
      
    } catch (err) {
      console.error("Ban Error:", err.message);
      showNotification(`Ban Failed: ${err.message}`, "error");
    }
  };

  // 4. Unban (Opens Modal)
  const handleUnbanClick = (id) => {
    setUnbanVisitorId(id);
    setUnbanPassword("");
    setShowPasswordModal(true);
    setMessage(""); // Clear notification messages
  };

  // 4. Unban (Modal Confirmation)
  const confirmUnban = async (e) => {
    e.preventDefault();
    const id = unbanVisitorId;
    const password = unbanPassword;

    if (!id || !password) {
      showNotification("Password is required.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/unban-visitor/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to unban visitor.");
      }

      showNotification(result.message, "success");
      setShowPasswordModal(false);
      setSelectedVisitor((prev) => (prev ? { ...prev, is_banned: 0 } : null)); // Update local state
      setUnbanPassword("");
      fetchVisitors();
    } catch (err) {
      console.error("Unban Error:", err.message);
      showNotification(`Unban Failed: ${err.message}`, "error");
      setUnbanPassword("");
    }
  };

  // 5. Export Data
  const handleExportData = () => {
    if (!selectedVisitor?.id) return;
    const url = `${API_BASE_URL}/export-visitors?id=${selectedVisitor.id}`;

    // NOTE: This relies on the backend route to set the Content-Disposition header
    window.open(url, "_blank");
    showNotification(
      `Export initiated for Visitor ID: ${selectedVisitor.id}`,
      "blue"
    );
  };

  // 6. Sign Out (From Dashboard)
  const handleVisitorLogout = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/exit-visitor/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to sign out visitor.");
      }

      showNotification(result.message, "success");
      fetchVisitors(); // Refresh the list
    } catch (err) {
      console.error("Logout Error:", err.message);
      showNotification(`Logout Failed: ${err.message}`, "error");
    }
  };

  // Determine which view to show
  const showDashboard = !selectedVisitor && !showRegistration;

  return (
    <div className="font-sans min-h-screen bg-blue-200 text-gray-800 p-4 md:p-8 flex flex-col items-center">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
      <script src="https://cdn.tailwindcss.com"></script>

      {/* Header */}
      <div className="flex flex-col items-center justify-center w-full mb-8">
        <h1 className="text-4xl font-extrabold text-blue-800 mb-2">
          Welcome To Catherine Booth House
        </h1>
        <p className="text-lg text-gray-600 mb-4">
          Visitors and Guests Tracking
        </p>
        <button
          onClick={() => {
            setShowRegistration(!showRegistration);
            setSelectedVisitor(null);
            setSearchResults([]);
            showNotification(
              showRegistration
                ? "Back to Dashboard"
                : "Registration Mode Activated",
              "blue"
            );
          }}
          className="w-full max-w-sm py-3 px-4 bg-purple-600 text-white font-semibold rounded-lg shadow-xl hover:bg-purple-700 transition-colors"
        >
          {showRegistration ? "Show Dashboard" : "Register New Visitor"}
        </button>
      </div>

      {/* Conditional Content Area */}
      <div className="w-full max-w-6xl mx-auto">
        {/* Dashboard View */}
        {showDashboard && (
          <VisitorsDashboard
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleSearchInput={handleSearchInput}
            loadingDashboard={isLoading}
            message={message}
            messageType={messageType}
            searchResults={searchResults}
            handleVisitorSelect={handleVisitorSelect}
            loadingInSite={isLoading && visitors.length === 0} // Only show loading if initial list is empty
            errorInSite={error}
            visitors={visitors}
            handleExit={handleVisitorLogout}
          />
        )}

        {/* Visitor Details/Log In View */}
        {selectedVisitor && (
          <VisitorDetailsForm
            selectedVisitor={selectedVisitor}
            editFormData={editFormData}
            setEditFormData={setEditFormData}
            handleExportFile={handleExportData}
            handleLogin={handleLogin}
            handleUpdate={handleUpdateAndLogin}
            handleBan={handleBan}
            handleUnbanClick={handleUnbanClick}
            handleCancelLogIn={handleCancelAction}
            message={message}
            messageType={messageType}
          />
        )}

        {/* Registration View */}
        {showRegistration && (
          <VisitorRegistrationForm
            message={message}
            messageType={messageType}
            formData={regFormData}
            handleInputChange={handleRegInputChange}
            handlePhotoChange={handlePhotoChange}
            photoPreviewUrl={photoPreviewUrl}
            dependents={regDependents}
            handleDependentChange={handleDependentChange}
            handleRemoveDependent={handleRemoveDependent}
            handleAddDependent={handleAddDependent}
            handleSubmit={handleNewVisitorRegistration}
            loadingRegistration={loadingRegistration}
            handleCancelRegistration={handleCancelAction}
          />
        )}
      </div>

      {/* Password Modal (Always rendered but hidden by state) */}
      <PasswordModal
        showPasswordModal={showPasswordModal}
        confirmUnban={confirmUnban}
        password={unbanPassword}
        setPassword={setUnbanPassword}
        showPassword={showUnbanPassword}
        setShowPassword={setShowUnbanPassword}
        message={message}
        messageType={messageType}
        setShowPasswordModal={setShowPasswordModal}
      />
    </div>
  );
}

export default App;
