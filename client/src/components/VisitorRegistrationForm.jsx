import React, { useRef, useState } from "react";
import { CameraIcon, PersonIcon, PhoneIcon } from "./IconComponents";

const VisitorRegistrationForm = ({
  message,
  messageType,
  formData,
  handleInputChange,
  handlePhotoChange,
  photoPreviewUrl,
  dependents,
  handleDependentChange,
  handleRemoveDependent,
  handleAddDependent,
  isAgreementCheckedAdult,
  setIsAgreementCheckedAdult,
  isAgreementCheckedChild,
  setIsAgreementCheckedChild,
  handleSubmit,
  loadingRegistration,
  handleCancelRegistration,
}) => {
  const fileInputRef = useRef(null);
  const [showPhotoChoice, setShowPhotoChoice] = useState(false);
  const [captureMode, setCaptureMode] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const isError = messageType === "error" && message;
  const isSuccess = messageType === "success" && message;

  const handlePhotoChoice = (mode) => {
    // 1. Determine the required capture attribute value
    let newCaptureMode = null;
    if (mode === "camera") {
      newCaptureMode = "user";
    }
    // 2. Update state to trigger re-render of the input element with the new attributes
    setCaptureMode(newCaptureMode);
    setInputKey((prevKey) => prevKey + 1);

    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
      setShowPhotoChoice(false);
    }, 50);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white p-6 md:p-10 rounded-xl shadow-2xl border border-blue-100">
      <h2 className="text-3xl font-bold text-purple-700 mb-6 text-center">
        New Visitor Registration
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Visitor Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Visitor Type
            </label>
            <select
              name="visitorType"
              value={formData.visitorType}
              onChange={handleInputChange}
              className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow bg-white"
            >
              <option value="visitor">Guest</option>
              <option value="contractor">Contractor</option>
              <option value="professional">Professional</option>
            </select>
          </div>

          {/* Company / Organization (Conditional) */}
          {["contractor", "professional"].includes(formData.visitorType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Company / Organization
              </label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
              />
            </div>
          )}
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
            <PersonIcon className="w-5 h-5" />
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
              required
            />
          </div>

          {/* Last Name */}
          <div>
            
            <label className="block text-sm font-medium text-gray-700">
            <PersonIcon className="w-5 h-5" />
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
              required
            />
          </div>
          {/* Know by other names*/}
          {["visitor"].includes(formData.visitorType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Known by any other Names
              </label>
              <input
                type="text"
                name="knownAs"
                value={formData.knownAs}
                onChange={handleInputChange}
                className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
              />
            </div>
          )}
          {/* address*/}
          {["visitor"].includes(formData.visitorType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
              />
            </div>
          )}
          {/* Phone Number */}
          <div>
            <PhoneIcon className="w-5 h-5" />
            <label className="block text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <input
              type="text"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Flat/Unit{" "}
            </label>
            <input
              type="text"
              name="unit"
              value={formData.unit}
              onChange={handleInputChange}
              className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
            />
          </div>

          {/* Reason for Visit  */}
          <div
            className={
              ["contractor", "professional"].includes(formData.visitorType)
                ? "md:col-span-1"
                : "md:col-span-2"
            }
          >
            <label className="block text-sm font-medium text-gray-700">
              Note/Reason for Visit
            </label>
            <textarea
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleInputChange}
              rows="2"
              className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:ring-purple-500 transition-shadow"
            ></textarea>
          </div>
        </div>
        {/* Photo and Dependents Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t">
          {/* Photo Upload */}         {" "}
          <div className="md:col-span-1 flex flex-col items-center space-y-3">
                       {" "}
            <label className="text-sm font-medium text-gray-700">
                 Visitor Photo 
            </label>
             
            <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center border-2 border-gray-300 shadow-inner">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt="Photo Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <PersonIcon className="w-16 h-16 text-gray-500" />
              )}
            </div>
                       {/* 1. Button to show/hide the choice options */}
            <button
              type="button"
              onClick={() => setShowPhotoChoice((prev) => !prev)}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-purple-500 text-white font-semibold rounded-lg shadow-md hover:bg-purple-600 cursor-pointer transition-colors"
            >
              <CameraIcon className="w-5 h-5" />
              <span>
                {showPhotoChoice ? "Cancel Choice" : "Select Photo Source"}
              </span>
            </button>
            <input
              id="photo-upload"
              key={inputKey}
              type="file"
              accept="image/*"
              {...(captureMode ? { capture: captureMode } : {})}
              ref={fileInputRef}
              onChange={handlePhotoChange}
              style={{
                position: "absolute",
                width: "0px",
                height: "0px",
                opacity: 0,
                pointerEvents: "none",
              }}
            />
            {/* 3. Photo Choice Buttons - Visible when state is true */}
            {showPhotoChoice && (
              <div className="flex justify-center gap-2 w-full p-2 bg-purple-50 rounded-lg shadow-inner border border-purple-200">
                <button
                  type="button"
                  onClick={() => handlePhotoChoice("camera")}
                  className="flex-1 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => handlePhotoChoice("upload")}
                  className="flex-1 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Upload File
                </button>
              </div>
            )}
               {" "}
          </div>
          {/* Additional Dependents */}
          {["visitor"].includes(formData.visitorType) && (
            <div className="md:col-span-2 space-y-3">
              <h4 className="text-lg font-semibold text-gray-800">
                Additional Dependents
              </h4>
              <div className="space-y-3">
                {dependents.map((dependent, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <input
                      type="text"
                      name="full_name"
                      placeholder="Dependent's Name"
                      value={dependent.full_name}
                      onChange={(e) => handleDependentChange(index, e)}
                      className="flex-grow p-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      name="age"
                      min="0"
                      placeholder="Age"
                      value={dependent.age}
                      onChange={(e) => handleDependentChange(index, e)}
                      className="w-full sm:w-20 p-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDependent(index)}
                      className="w-full sm:w-auto px-4 py-2 text-sm bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddDependent}
                  className="flex items-center text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors mt-2 p-1 rounded-md hover:bg-purple-50"
                >
                  + Add Dependent
                </button>
                <div className="mt-6">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAgreementCheckedChild}
                      onChange={(e) =>
                        setIsAgreementCheckedChild(e.target.checked)
                      }
                      className="form-checkbox h-5 w-5 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    />
                    <span className="text-base font-medium  text-red-500">
                      * Child Agreement & Disclaimer form completed and signed
                      (Staff Check)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
        {message && (isError || isSuccess) && (
          <div
            className={`p-3 rounded-lg text-center font-medium mb-4 ${
              messageType === "error"
                ? "bg-red-100 text-red-700 border-red-300"
                : messageType === "success"
                ? "bg-green-100 text-green-700 border-green-300"
                : "bg-blue-100 text-blue-700 border-blue-300"
            } border`}
          >
            {message}
          </div>
        )}

        {["contractor"].includes(formData.visitorType) && (
          <div className="mt-6">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAgreementCheckedAdult}
                onChange={(e) => setIsAgreementCheckedAdult(e.target.checked)}
                className="form-checkbox h-5 w-5 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
              />
              <span className="text-base font-medium  text-red-500">
                * Contractor H&S and Site Risk Assessment briefing completed and
                confirmed (Staff Check)
              </span>
            </label>
          </div>
        )}

        {["visitor", "professional"].includes(formData.visitorType) && (
          <div className="mt-6">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAgreementCheckedAdult}
                onChange={(e) => setIsAgreementCheckedAdult(e.target.checked)}
                className="form-checkbox h-5 w-5 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
              />
              <span className="text-base font-medium  text-red-500">
                * Visitor Agreement & Disclaimer form completed and signed
                (Staff Check)
              </span>
            </label>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-center space-x-4 pt-6 border-t">
          <button
            type="submit"
            className="px-8 py-3 font-bold rounded-lg transition-all shadow-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            disabled={
              loadingRegistration ||
              !formData.firstName ||
              !formData.lastName ||
              !isAgreementCheckedAdult ||
              (dependents.length > 0 && !isAgreementCheckedChild)
            }
          >
            {loadingRegistration ? "Registering..." : "Register & Sign In"}
          </button>
          <button
            type="button"
            onClick={handleCancelRegistration}
            className="px-8 py-3 font-bold rounded-lg transition-all shadow-xl bg-red-800 text-white hover:bg-red-900"
            disabled={loadingRegistration}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default VisitorRegistrationForm;
