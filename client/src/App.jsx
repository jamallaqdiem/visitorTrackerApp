import RegistrationForm from "./components/RegistrationForm";

// The main application component that renders the registration form.
// It uses a simple layout to center the form on the page.
function App() {
  const serverUrl = "http://localhost:3001";
  const handleCancel = () => {
    // This function will be called when the cancel button is clicked.
    // We can add logic here later, like clearing the form or navigating away.
    console.log("Cancel button clicked!");
  };
  const handleRegistrationSuccess = () => {
    // This function will be called upon successful registration
    console.log("Registration was successful!");
  };
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <RegistrationForm
        serverUrl={serverUrl}
        onCancel={handleCancel}
        onRegistrationSuccess={handleRegistrationSuccess}
      />
    </div>
  );
}

export default App;
