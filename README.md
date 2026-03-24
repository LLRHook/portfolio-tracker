# Portfolio Tracker

A self-hosted portfolio dashboard for tracking brokerage holdings with live market prices. Import your positions via CSV export from Fidelity (or any brokerage), and get a real-time dashboard with allocation charts, performance stats, and sortable holdings.

![Node.js](https://img.shields.io/badge/Node.js-22-green)
![React](https://img.shields.io/badge/React-19-blue)
![Docker](https://img.shields.io/badge/Docker-ready-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **CSV Import** — drag-and-drop upload, parses Fidelity export format out of the box
- **Live Prices** — real-time quotes via Yahoo Finance (no API key needed)
- **Dashboard** — holdings table, allocation donut chart, stat cards (total value, day change, gain/loss)
- **Auth** — password-protected with session cookies and bcrypt
- **Encrypted Storage** — access tokens and sensitive data encrypted at rest (AES-256-GCM)
- **Dockerized** — one command to run everything

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS v4, Recharts |
| Backend | Express 5, better-sqlite3 |
| Auth | bcrypt, express-session |
| Infra | Docker Compose, Node 22 |

## Quick Start (Docker)

```bash
# Clone the repo
git clone https://github.com/LLRHook/portfolio-tracker.git
cd portfolio-tracker

# Create your env file
cp .env.example .env

# Generate an encryption key and add it to .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Start everything
docker compose up --build
```

Open **http://localhost:34891** and log in with `admin` / `admin`.

> Change the default password after first login, or set a custom one by modifying the seed logic in `server/server.js`.

## Quick Start (Local)

```bash
# Install dependencies
npm install
cd client && npm install && cd ../server && npm install && cd ..

# Create env files
cp .env.example .env
cp server/.env.example server/.env

# Generate an encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add it to server/.env as ENCRYPTION_KEY=<key>

# Start dev servers
npm run dev
```

Client runs on `:34891`, server on `:34892`.

## Usage

1. **Log in** with `admin` / `admin`
2. **Export your holdings** from Fidelity as CSV (`Accounts & Trade > Positions > Download`)
3. **Upload the CSV** via the drag-and-drop import screen
4. **View your dashboard** with live prices, allocation breakdown, and performance stats

### Supported CSV Format

The parser handles Fidelity's standard positions export:

```
Account Number,Account Name,Symbol,Description,Quantity,Last Price,...,Cost Basis Total,Average Cost Basis,Type
```

Money market positions (e.g., SPAXX), dollar signs, percentage symbols, and disclaimer rows are all handled automatically.

## Project Structure

```
portfolio-tracker/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Dashboard, HoldingsTable, Charts, Login, CsvUpload
│   │   ├── context/        # AuthContext
│   │   └── api.js          # API client
│   └── Dockerfile
├── server/                 # Express backend
│   ├── server.js           # API routes, CSV parser, Yahoo Finance integration
│   ├── db.js               # SQLite schema, encryption helpers, CRUD
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLIENT_PORT` | Frontend port | `34891` |
| `SERVER_PORT` | Backend port | `34892` |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM | *required* |
| `SESSION_SECRET` | Express session secret | `dev-secret-change-me` |

## License

[MIT](LICENSE)
