                                                             Visitor Tracking Client Application

This directory contains the frontend client built with React and Vite, styled using Tailwind CSS. This application is responsible for the user interface, handling visitor registration, real-time status display, and triggering all necessary API calls to the backend server.

🚀 Local Development Setup
To get the client application running locally:

1. Prerequisites
Ensure the backend server is running first (npm run start in the /server directory) to avoid connectivity issues. The client is configured to expect the backend API at the address defined.

2. Installation
Navigate into this /client directory and install the necessary dependencies:

npm install

3. Run the Application
Start the Vite development server. This command will typically launch the application on http://localhost:5173.

npm run dev

🛠️ Technology Stack
This application is built upon a modern, powerful stack:

React: Core library for building the user interface components.

Vite: Next-generation frontend tooling for fast development and bundling.

Tailwind CSS: Utility-first CSS framework used for all styling and responsive design.

📂 Key Component Structure

The frontend application uses a component-based architecture for modularity.

src/App.jsx: The main application file. It manages the primary application state, handles routing between views (e.g., the registration page and the current visitors dashboard), and renders the main components.

src/components/VisitorDetailsForm.jsx: Manages the complex form logic for visitor registration, including handling dependent/contractor/professional fields, photo uploads, and submitting data to the /api/register endpoint.

src/components/VisitorStatusList.jsx: Component responsible for fetching and displaying the real-time list of visitors currently on-site, typically using a polling mechanism or WebSockets (if implemented) to connect to the backend's data stream.

Other Components: Contains modular UI elements like buttons, modals (for Ban/Unban confirmation), and search/filtering logic.

Database Connectivity: Real-time status of the SQLite connection.

Client Errors: Displays a RENDER_CRASH warning if the Error Boundary catches a frontend exception.

src/components/ErrorBoundary.jsx: Wraps the application to catch React render crashes and report them to Sentry.

src/components/ContractorHandoverModal.jsx: A specialized safety modal that intercepts sign-outs for contractors to ensure maintenance updates are relayed to management

.env requirements:
CLIENT_URL: The URL of the frontend client (required for CORS configuration, e.g., http://localhost:5173).
VITE_SENTRY_DSN: The DSN key for frontend error reporting.

🎨 Styling

All user interface styling is handled using Tailwind CSS utility classes. This ensures consistency and responsive design across all devices. No custom CSS files are used, simplifying the styling workflow.

📡 API Interaction

All communication with the backend is handled asynchronously within the components or custom React Hooks.

The primary API endpoint used for reading real-time data is GET /api/visitors.

Sensitive actions like Ban/Unban utilize the confirmation modal (as seen in the screenshots) to pass the administrative password to the respective POST /api/ban/:id or POST /api/unban/:id endpoints.