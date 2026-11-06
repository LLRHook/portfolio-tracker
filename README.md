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
| CSV processor | Rust 1.93+, built with Cargo |
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

Install Node.js 22 and Rust 1.93 or newer (including Cargo). The local server's
`dev`, `start`, and `test` npm scripts build the required native CSV processor
before running. Docker builds it in a separate Rust stage; the running image
does not need Cargo.

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

Imports require Account Number, Symbol, Quantity, and Current Value columns.
Malformed numeric fields, duplicate positions, and invalid snapshot dates return
a validation error before existing portfolio data is replaced. Optional prices
and cost basis may be blank or `--`; an unreported equity cost basis stays unknown.
Quoted fields support commas, escaped quotes, and embedded newlines on the server.
Fidelity data disclaimers, informational export footers, and download-date records
are recognized separately from positions, including prose containing commas.
Position validation continues after footer records so malformed rows still reject
the entire import without changing stored portfolio data.

Repeated imports update one snapshot per user, date, symbol and account name,
including unnamed accounts. Missing, blank and whitespace-only CSV account names
become SQL NULL; the literal account name `null` remains a name. Storage also
preserves an explicit empty account name from a backup as distinct from NULL.
Holdings and closed-position writes use the same account identity, with close
date included for closed positions. Import state reads and writes share one
SQLite write transaction after the benchmark quote is fetched, so concurrent
imports use the state committed before their transaction starts.

Older databases may already contain multiple unnamed rows for the same key.
There is no automatic deletion, merging or historical-data migration. Imports
that encounter ambiguous current holdings, latest snapshot prices, or a target
snapshot/closed-position key fail atomically with the existing HTTP 500 import
error; those duplicate records need explicit review before retrying. Other
historical duplicates remain stored. Backups containing duplicate unnamed keys
are also rejected before restore replaces any records. These safeguards apply
to application writers; the unchanged SQLite schema alone does not prevent
someone inserting NULL-account duplicates with raw SQL.

`POST /api/import` sends each entire upload to the Rust processor over stdin and
awaits its validated holdings and snapshot date before calculating totals or
writing to SQLite. There is one process per file, with no JavaScript parsing
fallback. CSV contents are not passed on the command line or written to a
temporary CSV file. Missing download dates use the server's current UTC date.
CSV validation still returns HTTP 400 with `{ "error": "..." }`; a missing or
failed processor returns HTTP 500 with `{ "error": "Failed to import CSV" }`.
The native response is limited to 64 MiB and processing to 30 seconds; exceeding
either limit also returns that 500 response without changing portfolio data.

Express routes, authentication, encryption helpers, SQLite transactions, benchmark
calculations and the React UI remain JavaScript. Only CSV tokenization and import
validation run in Rust.

### Regression tests

```bash
npm --prefix server ci
npm --prefix server run test:rust
npm --prefix server test
cargo fmt --manifest-path server/rust/fidelity-csv/Cargo.toml --check
cargo clippy --locked --manifest-path server/rust/fidelity-csv/Cargo.toml --all-targets -- -D warnings
npm --prefix client ci
npm --prefix client run build
```

The tests use synthetic CSV records, temporary or in-memory SQLite databases,
and mocked benchmark responses. A frozen test-only JavaScript reference checks
Rust parity for quoting, whitespace, dates, optional fields and error messages.
HTTP tests cover validation before writes, repeated dated imports and rollback
after a simulated SQLite failure. Import integrity regressions exercise blank,
missing and explicit-null account identities, empty-account backup compatibility,
legacy ambiguity, restart persistence, and concurrent independent SQLite/HTTP
connections through the required Rust processor. HTTP fixtures use synthetic
sessions and ephemeral loopback ports without starting the default-user seeder.
They do not load local `.env` files, read
account data, or contact market data services. CI builds the native processor
and runs the server tests on Node 22. Native npm modules such as `better-sqlite3`
must be installed using the same Node major version used to run the tests.

To build just the native executable, run `npm --prefix server run build:csv`.
It copies Cargo's release artifact to `server/bin/` and honors `CARGO_TARGET_DIR`.
For a prebuilt deployment, run `node server.js` from `server/` with
`FIDELITY_CSV_BIN` pointing to the platform's executable. Compose uses a Linux
binary in `/usr/local/bin`, outside its `/app` source bind mount; rebuild the
server image after changing Rust sources.

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
│   ├── server.js           # API routes and Yahoo Finance integration
│   ├── fidelity-csv.js     # Async native CSV processor bridge
│   ├── rust/fidelity-csv/  # Rust CSV parsing, validation and JSON CLI
│   ├── scripts/           # Native build/artifact installation
│   ├── db.js               # SQLite schema, encryption helpers, CRUD
│   ├── test/               # Fixture-only parser, database, and HTTP regressions
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
| `DATABASE_PATH` | Optional SQLite file path (`:memory:` for isolated tests) | `server/portfolio.db`, or `/app/data/portfolio.db` in production |
| `FIDELITY_CSV_BIN` | Path to the required native CSV processor | Built executable in `server/bin/`; `/usr/local/bin/portfolio-fidelity-csv` in Docker |

## License

[MIT](LICENSE)
