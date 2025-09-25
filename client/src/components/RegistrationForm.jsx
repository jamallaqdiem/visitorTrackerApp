import React, { useState, useEffect } from "react";

// Icons for the UI (inlined for component self-containment)
const PersonIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const PhoneIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.75-.25 1.02l-2.2 2.2z" />
  </svg>
);

const CameraIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 9c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zM22 6c0-1.1-.9-2-2-2h-3.17L14 2H8L7.17 4H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z" />
  </svg>
);

const MessageModal = ({ message, type, onClose }) => {
  const bgColor = type === "success" ? "bg-green-100" : "bg-red-100";
  const textColor = type === "success" ? "text-green-700" : "text-red-700";

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-gray-900 bg-opacity-50">
      <div
        className={`p-6 rounded-lg shadow-2xl w-96 text-center ${bgColor} ${textColor}`}
      >
        <h3 className="text-xl font-bold mb-4">
          {type === "success" ? "Success!" : "Error!"}
        </h3>
        <p className="mb-6">{message}</p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// This component encapsulates all the logic and UI for visitor registration.
const RegistrationForm = ({ serverUrl, onRegistrationSuccess, onCancel }) => {
  // State for the registration form
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    unit: "",
    reasonForVisit: "",
    visitorType: "professional",
    company_name: "",
  });
  const [dependents, setDependents] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [loadingRegistration, setLoadingRegistration] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState({ text: "", type: "" });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleDependentChange = (index, e) => {
    const { name, value } = e.target;
    const newDependents = [...dependents];
    newDependents[index][name] = value;
    setDependents(newDependents);
  };

  const handleAddDependent = () => {
    setDependents((prevDependents) => [
      ...prevDependents,
      { full_name: "", age: "" },
    ]);
  };

  const handleRemoveDependent = (index) => {
    setDependents((prevDependents) =>
      prevDependents.filter((_, i) => i !== index)
    );
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingRegistration(true);
    setModalMessage({ text: "", type: "" });
    setShowModal(false);

    const form = new FormData();
    form.append("first_name", formData.firstName);
    form.append("last_name", formData.lastName);
    form.append("phone_number", formData.phoneNumber);
    form.append("unit", formData.unit);
    form.append("reason_for_visit", formData.reasonForVisit);
    form.append("type", formData.visitorType);
    form.append("company_name", formData.company_name);
    form.append("additional_dependents", JSON.stringify(dependents));

    if (photo) {
      form.append("photo", photo);
    }

    try {
      const response = await fetch(`${serverUrl}/register-visitor`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error("Registration failed.");
      }
      await response.json();
      setModalMessage({
        text: "Visitor registered successfully!",
        type: "success",
      });
      setShowModal(true);
      // Call the success callback provided by the parent component
      if (onRegistrationSuccess) {
        onRegistrationSuccess();
      }
    } catch (err) {
      setModalMessage({
        text: `Registration failed: ${err.message}`,
        type: "error",
      });
      setShowModal(true);
      console.error("Registration error:", err);
    } finally {
      setLoadingRegistration(false);
    }
  };

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  return (
    <>
      <div className="bg-white shadow-xl rounded-lg p-8 w-full max-w-2xl mx-auto my-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          Visitor Registration
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* First Name */}
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-gray-700"
              >
                First Name
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <PersonIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  name="firstName"
                  id="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="John"
                />
              </div>
            </div>

            {/* Last Name */}
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-gray-700"
              >
                Last Name
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <PersonIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  name="lastName"
                  id="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Doe"
                />
              </div>
            </div>
          </div>

          {/* Other fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="phoneNumber"
                className="block text-sm font-medium text-gray-700"
              >
                Phone Number
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <PhoneIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  name="phoneNumber"
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="123-456-7890"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="unit"
                className="block text-sm font-medium text-gray-700"
              >
                Unit to Visit
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="text"
                  name="unit"
                  id="unit"
                  value={formData.unit}
                  onChange={handleInputChange}
                  className="block w-full rounded-md border-gray-300 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Apt 101"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="reasonForVisit"
              className="block text-sm font-medium text-gray-700"
            >
              Reason for Visit
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="text"
                name="reasonForVisit"
                id="reasonForVisit"
                value={formData.reasonForVisit}
                onChange={handleInputChange}
                className="block w-full rounded-md border-gray-300 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Meeting with a resident"
              />
            </div>
          </div>

          {/* Visitor Type */}
          <div>
            <label
              htmlFor="visitorType"
              className="block text-sm font-medium text-gray-700"
            >
              Visitor Type
            </label>
            <select
              id="visitorType"
              name="visitorType"
              value={formData.visitorType}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            >
              <option value="professional">Professional</option>
              <option value="contractor">Contractor</option>
              <option value="guest">Guest</option>
            </select>
          </div>

          {/* Company Name (only for professional and contractor) */}
          {(formData.visitorType === "professional" ||
            formData.visitorType === "contractor") && (
            <div>
              <label
                htmlFor="company_name"
                className="block text-sm font-medium text-gray-700"
              >
                Company Name
              </label>
              <input
                type="text"
                name="company_name"
                id="company_name"
                value={formData.company_name}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Google"
              />
            </div>
          )}

          {/* Dependents section (only for guests) */}
          {formData.visitorType === "guest" && (
            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                Additional Dependents
              </h3>
              {dependents.map((dependent, index) => (
                <div key={index} className="flex items-center space-x-4 mb-4">
                  <input
                    type="text"
                    name="full_name"
                    value={dependent.full_name}
                    onChange={(e) => handleDependentChange(index, e)}
                    className="block w-full rounded-md border-gray-300 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Full Name"
                  />
                  <input
                    type="number"
                    min="0"
                    name="age"
                    value={dependent.age}
                    onChange={(e) => handleDependentChange(index, e)}
                    className="block w-24 rounded-md border-gray-300 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Age"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveDependent(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddDependent}
                className="mt-2 text-blue-600 hover:text-blue-800"
              >
                + Add Dependent
              </button>
            </div>
          )}

          {/* Photo Upload */}
          <div>
            <label
              htmlFor="photo"
              className="block text-sm font-medium text-gray-700"
            >
              Photo
            </label>
            <div className="mt-1 flex items-center">
              <label
                htmlFor="photo"
                className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <CameraIcon className="w-5 h-5 inline-block mr-2" />
                Upload Photo
                <input
                  id="photo"
                  name="photo"
                  type="file"
                  className="sr-only"
                  onChange={handlePhotoChange}
                  accept="image/jpeg,image/png,image/gif"
                />
              </label>
              {photoPreviewUrl && (
                <img
                  src={photoPreviewUrl}
                  alt="Photo Preview"
                  className="ml-4 w-20 h-20 object-cover rounded-md"
                />
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-transparent text-base font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={loadingRegistration}
            >
              {loadingRegistration ? "Registering..." : "Register"}
            </button>
          </div>
        </form>
      </div>

      {showModal && (
        <MessageModal
          message={modalMessage.text}
          type={modalMessage.type}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

export default RegistrationForm;
