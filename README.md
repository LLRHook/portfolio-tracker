# Fidelity Portfolio Dashboard

A real-time portfolio tracking dashboard built with React, Express, and the Plaid API.

## Project Structure

```
portfolio-tracker/
  client/          # Vite + React + Tailwind CSS v4
  server/          # Express + Plaid + SQLite
```

## Prerequisites

- Node.js 20+
- A Plaid developer account (https://dashboard.plaid.com)

## Setup

1. Install dependencies:

```bash
npm install
cd client && npm install
cd ../server && npm install
```

2. Configure environment variables:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Edit `server/.env` with your Plaid credentials and generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Start the development servers:

```bash
npm run dev
```

This runs both the client (http://localhost:5173) and server (http://localhost:3001) concurrently.

## Tech Stack

- **Frontend**: React 19, Tailwind CSS v4, Recharts, React Router
- **Backend**: Express 5, Plaid Node SDK, better-sqlite3
- **Auth**: bcrypt, express-session
