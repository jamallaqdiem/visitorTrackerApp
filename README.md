
                                                     Visitor Tracking and Management System

This is a comprehensive, full-stack application designed to manage, log, and track visitors (including professionals, contractors, and guests with dependents) in real-time. The 

system provides secure sign-in/sign-out functionality, robust administrative controls (ban/unban), and data export capabilities.

The application is built using a modern Node.js/Express backend with SQLite for persistent data storage, and a React/Vite frontend utilizing Tailwind CSS for a responsive, modern interface.

🚀 Features
Frontend (Client)
Real-time Status Display: Shows a list of all visitors currently on-site, fetched in real-time from the database.

Visitor Registration: A guided form to register different visitor types:

Professionals/Contractors: Capture company name, contact, and visit details.

Guests: Ability to add multiple dependents (full name and age).

Includes mandatory photo upload for identification.

Visitor Management Screen: Dedicated interface for searching, viewing, and updating individual visitor records.

Administrative Actions: Secure Ban/Unban functionality verified by a server-side password (from .env).

Update Details: Edit contact information, unit visited, and purpose.

Data Export: Feature to export the entire history data for a specific visitor into a CSV file.

Backend (Server)
Node.js/Express: A clean, componentized API structure (registration.js, visitors.js, login.js, etc.).

SQLite3 Database: Local, file-based persistence for visitor records and history.

Secure Ban/Unban: Administrative actions are protected by a shared secret password stored in the server's .env file.

API Endpoints: Dedicated routes for registration, sign-in/out, status check, administrative updates, and history export.

🛠️ Tech Stack
Client (Frontend)
React: Frontend library for building the user interface.

Vite: Build tool for fast development and bundling.

Tailwind CSS: Utility-first CSS framework for styling and responsive design.

Server (Backend)
Node.js & Express: Runtime environment and web framework for the REST API.

SQLite3: Database for persistent storage.

DOTENV: For environment variable management.

Cross-Origin Resource Sharing (CORS): Configured for development communication between client and server.

📁 Project Structure
The repository is structured as a mono-repo containing both the client (React) and server (Node.js) applications:

/visitor-tracker-app
├── /client/                  (React Frontend - Vite/Tailwind)
│   ├── /src/
│   │   ├── /components/      (e.g., VisitorDetailsForm.jsx, RegistrationForm.jsx, index.css, main.jsx)
│   │   └── App.jsx           (Main application component)
│   ├── package.json
├── /server/                  (Node.js/Express Backend - SQLite)
│   ├── /db/                  (Database initialization scripts/files)
│   │   └── visitors.db       (The SQLite database file)
|   |---/auth/               (Authentication file, registration.js)   
│   ├── /routes/              (Modular Express router files, e.g., visitors.js)
│   ├── server.js             (Main Express application file)
│   ├── package.json
|   |--- Uploads                (Folder for img storage) 
│   ├── .env.example          (Template for environment variables)
│   └── README.md             (API documentation and server setup)
├── .gitignore
└── README.md                 (Project Overview)

⚙️ Setup and Installation
Follow these steps to get the application running locally.

1. Prerequisites
You must have the following installed:

Node.js (LTS version recommended)

npm or Yarn

2. Backend Setup (/server)
Navigate to the server directory:

cd server

Install dependencies:

npm install
# or
yarn install

Configure Environment Variables:

Create a file named .env inside the /server directory.

Copy the content from .env.example into your new .env file and fill in the values.

.env Example:

PORT=3001
ADMIN_PASSWORD=your_secure_admin_password
# This password is used to authorize ban/unban actions

Run the backend server:

npm start
# or
yarn start

The server will start on the port specified in your .env file (e.g., http://localhost:3001).

3. Frontend Setup (/client)
Navigate to the client directory:

cd ../client

Install dependencies:

npm install
# or
yarn install

Start the React development server:

npm run dev
# or
yarn dev

The client application will typically open at http://localhost:5173/ (Vite's default port).|