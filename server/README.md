                                                           Visitor Tracking Backend Server
                                                           
This directory contains the Node.js/Express backend API for the Visitor Tracking and Management System. It is responsible for handling all persistent data storage (SQLite), processing administrative actions, and serving visitor data to the frontend client.

⚙️ Dependencies and Setup
Installation
Ensure you are in the /server directory.

Install required Node.js packages:

npm install

Environment Variables
The server relies on environment variables for configuration and security. Create a file named .env in this directory and define the following variables:

SENTRY_DSN:The DSN key for backend error reporting.
PORT: The port on which the Express server will run (e.g., 3001).
MASTER_PASSWORD2:THe password to access database
MASTER_PASSWORD: The secret password required to authorize sensitive actions (e.g., BAN, UNBAN).
Database
This application uses a file-based SQLite3 database.

The database file is located at server/db/visitors.db.

The server.js file handles the initial connection and table creation if the database does not exist.

💾 Database Schema Overview (SQLite)
The core data is managed across three main tables to track visitors and their history.


Table: visitors (Visitor Master Data)
Stores primary identification and status information for each person.

visitor_id: INTEGER (PRIMARY KEY) - Unique ID for the visitor.

first_name: TEXT (NOT NULL) - Visitor's first name.

last_name: TEXT (NOT NULL) - Visitor's last name.

photo_path: TEXT - File path to the uploaded photo.

is_banned: INTEGER (DEFAULT 0) - Ban status (1 for banned, 0 for active).

created_at: DATETIME (DEFAULT CURRENT_TIMESTAMP) - Record creation timestamp.



Table: visits (Sign-In/Sign-Out Logs)
Stores a log of every visit, linking back to the visitors table.

visit_id: INTEGER (PRIMARY KEY) - Unique ID for the visit log.

visitor_id: INTEGER (FOREIGN KEY) - Links to the visitors table.

unit: TEXT - The unit/apt number visited.

phone_number: TEXT - Contact number.

type: TEXT (NOT NULL) - The visitor category: professional, contractor, or guest.

company_name: TEXT - Company name (if professional/contractor).

reason_for_visit: TEXT - Purpose of the visit.

entry_time: DATETIME (NOT NULL) - Timestamp of sign-in.

exit_time: DATETIME - Timestamp of sign-out (NULL if currently on-site).

notes: TEXT - General notes.




Table: dependents (Guest Dependent Details)

Stores details for guests who are accompanied by other people (dependents).

dependent_id: INTEGER (PRIMARY KEY) - Unique ID.

visitor_id: INTEGER (FOREIGN KEY) - Links to the primary visitor (guest).

full_name: TEXT (NOT NULL) - Full name of the dependent.

age: INTEGER - Age of the dependent.



🌐 API Endpoints

All endpoints are prefixed with /api.

POST /api/register

Description: Registers a new visitor and logs their initial sign-in.

Body: FormData including visitor details, a photo file, and a JSON string for additional_dependents.

GET /api/visitors

Description: Retrieves a list of all visitors currently signed in (where exit_time is NULL).

Body: None.

GET /api/visitors/:id

Description: Retrieves detailed information about a specific visitor by ID.

Body: None.

PUT /api/update/:id

Description: Updates a visitor's details (e.g., contact info, company name, unit).

Body: JSON object with fields like {firstName, lastName, phoneNumber, unit, reasonForVisit}.

POST /api/signout/:id

Description: Logs the visitor out by setting the exit_time for their active visit.

Body: None.

POST /api/ban/:id

Description: Bans a visitor by setting is_banned = 1.


POST /api/unban/:id

Description: Unbans a visitor by setting is_banned = 0.

Body: JSON object containing { admin_password: '...' }.

GET /api/export-history/:id

Description: Exports the full visit history for a visitor as a CSV file.

Body: None (The response is a file download).




🧪 Testing

Testing is implemented using Node.js's built-in testing utilities (or Jest/Mocha if configured).

Test files are located alongside their respective route files (e.g., registration.test.js tests registration.js).

To run all tests:

npm test
