cd# Fantasy Football Analytics Platform

This is a comprehensive fantasy football application built with **React** (Frontend) and **Django** (Backend) using **MongoDB**.

## Prerequisites

1.  **Python 3.10+**
2.  **Node.js 18+**
3.  **MongoDB Community Edition** (Running on default port `27017`)

## Quick Start (Windows)

To start both the backend and frontend simultaneously, simply double-click the `run_app.bat` file in this directory.

---

## Manual Setup

### 1. Backend (Django)

The backend uses the virtual environment in `backend/venv`.

MongoDB settings are read from environment variables:

- `MONGO_URI` - MongoDB connection string, for example `mongodb://127.0.0.1:27017`
- `MONGO_DB_NAME` - database name used by the backend, for example `fantasyfootball_db`

If you already used `MONGODB_URI`, it is still accepted as a fallback.

Signup verification emails are sent through Django's email backend. For Gmail,
`EMAIL_HOST_USER` must be the sender email address and `EMAIL_HOST_PASSWORD`
must be a Gmail app password, not the normal account password. For local testing
without sending real email, set:

```bash
set EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

The verification code will then print in the backend terminal.

On startup, the backend now performs a safe MongoDB bootstrap:

- It pings MongoDB before the server starts.
- It reuses the existing database if it already exists.
- It creates only missing collections and indexes.
- It does not drop, reset, or overwrite existing documents.
- It creates the model-backed collections used by users, players, squads, transfers, matches, and admin profiles, plus safe placeholder collections for leaderboard, notifications, and profiles.

```bash
# Navigate to backend
cd backend

# Set the MongoDB connection values if needed
set MONGO_URI=mongodb://127.0.0.1:27017
set MONGO_DB_NAME=fantasyfootball_db

# Run Django with the project virtual environment
venv\Scripts\python.exe manage.py migrate

# Start server
venv\Scripts\python.exe manage.py runserver 8000
```

### 2. Frontend (React)

```bash
# Navigate to frontend
cd frontend

# Install dependencies (if not already done)
npm install

# Start development server
npm start
```

## Important Notes

- **CORS**: The backend is configured to allow requests from `localhost:3000`.
- **Database**: Ensure MongoDB is running before starting the backend. If MongoDB is unavailable, the backend now fails fast with a clear startup error.
- **Auto-setup**: A fresh MongoDB database is initialized automatically when the server starts, and an existing database is reused as-is.
- **Admin**: You can access the Django admin at `http://localhost:8000/admin/`.
