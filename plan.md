# Fidelity Portfolio Dashboard — MVP Build Plan

## What's Done

- [x] Dashboard UI (React) — holdings table, performance chart, donut allocation, stat cards
- [x] Plaid Link connect screen with simulated auth flow
- [x] Express.js server with Plaid endpoints (link token, token exchange, holdings, transactions)
- [x] `usePlaid.js` React hook for frontend integration
- [x] Setup guide with architecture, production checklist, and security notes

---

## What's Left (in build order)

### 1. Project Scaffolding

- [ ] Initialize monorepo structure:
  ```
  fidelity-dashboard/
  ├── client/          # React app (Vite or CRA)
  │   ├── src/
  │   ├── package.json
  │   └── .env
  ├── server/          # Express API
  │   ├── server.js
  │   ├── package.json
  │   └── .env
  └── README.md
  ```
- [ ] Add `package.json` scripts for both client and server
- [ ] Set up `.env` files with `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
- [ ] Add a root-level `start` script that boots both (e.g. `concurrently`)

### 2. Persistent Token Storage (SQLite)

- [ ] Install `better-sqlite3`
- [ ] Create `db.js` module with a `tokens` table:
  - `id` (primary key)
  - `user_id` (text, unique)
  - `access_token` (text, encrypted)
  - `item_id` (text)
  - `created_at` (datetime)
- [ ] Replace in-memory `ACCESS_TOKEN` variable with DB reads/writes
- [ ] Encrypt access tokens at rest (use `crypto.createCipheriv` with a key from `.env`)
- [ ] Add a `/api/status` endpoint that checks if a token exists (so the UI knows whether to show the connect screen or the dashboard)

### 3. Plaid Webhooks

- [ ] Add `POST /api/webhook` endpoint
- [ ] Handle these webhook types:
  - `HOLDINGS: DEFAULT_UPDATE` — re-fetch holdings
  - `INVESTMENTS_TRANSACTIONS: DEFAULT_UPDATE` — re-fetch transactions
  - `ITEM: ERROR` — flag token as stale, prompt re-auth
- [ ] Verify webhook signatures using Plaid's verification key
- [ ] Store last sync timestamp in DB, surface it in the UI

### 4. Basic Auth

- [ ] Add a `users` table (or hardcode a single user for personal use)
- [ ] `POST /api/login` — accepts password, returns a session cookie
- [ ] Middleware that checks session on all `/api/*` routes except `/api/login` and `/api/webhook`
- [ ] Hash password with `bcrypt`
- [ ] Frontend login screen that gates the dashboard
- [ ] Auto-redirect to login if session expires

### 5. Error & Loading States (Frontend)

- [ ] Global error boundary component
- [ ] Loading skeletons for holdings table, charts, and stat cards
- [ ] Handle and display these states:
  - Plaid Link fails or user exits early
  - Access token expired (prompt re-link)
  - Network error / backend unreachable
  - Empty portfolio (no holdings)
- [ ] Toast notifications for sync success/failure
- [ ] "Reconnect" button if the Plaid item enters an error state

### 6. Personal Tweaks (your call)

- [ ] Customize watchlist or add target allocations
- [ ] Add dividend tracking / income projections
- [ ] Historical performance with more granular time ranges
- [ ] Multiple account support (joint, IRA, 401k)
- [ ] Dark/light theme toggle
- [ ] Mobile responsive layout
- [ ] Export to CSV / PDF

---

## Key Commands (once scaffolded)

```bash
# Install everything
cd client && npm install && cd ../server && npm install

# Start dev (from root)
npm run dev        # boots client on :3000, server on :3001

# First run
# 1. Add Plaid keys to server/.env
# 2. Start the app
# 3. Click "Connect with Plaid" and link your Fidelity account
# 4. Dashboard populates with real data
```

---

## Reference Links

| Resource | URL |
|----------|-----|
| Plaid Dashboard | https://dashboard.plaid.com |
| Plaid Investments Docs | https://plaid.com/docs/investments |
| Plaid Link (React) | https://github.com/plaid/react-plaid-link |
| Plaid Webhooks | https://plaid.com/docs/api/webhooks |
| better-sqlite3 | https://github.com/WiseLibs/better-sqlite3 |
