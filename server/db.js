import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NODE_ENV === 'production' ? '/app/data' : __dirname;
const db = new Database(path.join(dataDir, 'portfolio.db'));

db.pragma('journal_mode = WAL');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL,
    cost_basis REAL,
    last_price_change REAL,
    account_name TEXT,
    imported_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, symbol, account_name)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// --- Migrations ---
try {
  db.exec('ALTER TABLE holdings ADD COLUMN last_price_change REAL');
} catch (_) { /* column already exists */ }
try {
  db.exec('ALTER TABLE daily_totals ADD COLUMN spy_shares REAL DEFAULT 0');
} catch (_) { /* column already exists */ }

// --- Encryption helpers ---
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// --- Holdings CRUD ---
const upsertHoldingStmt = db.prepare(`
  INSERT INTO holdings (user_id, symbol, description, quantity, cost_basis, last_price_change, account_name)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, symbol, account_name) DO UPDATE SET
    description = excluded.description,
    quantity = excluded.quantity,
    cost_basis = excluded.cost_basis,
    last_price_change = excluded.last_price_change,
    imported_at = datetime('now')
`);

const getHoldingsStmt = db.prepare('SELECT * FROM holdings WHERE user_id = ?');
const deleteHoldingsStmt = db.prepare('DELETE FROM holdings WHERE user_id = ?');
const holdingsExist = db.prepare('SELECT COUNT(*) as count FROM holdings WHERE user_id = ?');

export function upsertHolding(userId, holding) {
  upsertHoldingStmt.run(
    userId,
    holding.symbol,
    holding.description || null,
    holding.quantity,
    holding.costBasis || null,
    holding.lastPriceChange || null,
    holding.accountName || null,
  );
}

export function getHoldings(userId) {
  return getHoldingsStmt.all(userId);
}

export function deleteHoldings(userId) {
  deleteHoldingsStmt.run(userId);
}

export function hasHoldings(userId) {
  return holdingsExist.get(userId).count > 0;
}

// --- User CRUD ---
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)');
const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const userCount = db.prepare('SELECT COUNT(*) as count FROM users');

export function createUser(username, passwordHash) {
  return insertUser.run(username, passwordHash);
}

export function findUser(username) {
  return getUserByUsername.get(username);
}

export function getUserCount() {
  return userCount.get().count;
}

// --- Snapshot tables ---
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL,
    cost_basis REAL,
    current_price REAL,
    current_value REAL,
    account_name TEXT,
    UNIQUE(user_id, snapshot_date, symbol, account_name)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_totals (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    total_value REAL NOT NULL,
    total_cost REAL NOT NULL,
    day_gain_loss REAL,
    holdings_count INTEGER,
    UNIQUE(user_id, snapshot_date)
  )
`);

// --- Snapshot CRUD ---
const insertSnapshotStmt = db.prepare(`
  INSERT INTO snapshots (user_id, snapshot_date, symbol, description, quantity, cost_basis, current_price, current_value, account_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, snapshot_date, symbol, account_name) DO UPDATE SET
    description = excluded.description,
    quantity = excluded.quantity,
    cost_basis = excluded.cost_basis,
    current_price = excluded.current_price,
    current_value = excluded.current_value
`);

const insertDailyTotalStmt = db.prepare(`
  INSERT INTO daily_totals (user_id, snapshot_date, total_value, total_cost, day_gain_loss, holdings_count, spy_shares)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
    total_value = excluded.total_value,
    total_cost = excluded.total_cost,
    day_gain_loss = excluded.day_gain_loss,
    holdings_count = excluded.holdings_count,
    spy_shares = excluded.spy_shares
`);

const getDailyTotalsStmt = db.prepare(
  'SELECT * FROM daily_totals WHERE user_id = ? AND snapshot_date BETWEEN ? AND ? ORDER BY snapshot_date'
);

const getHoldingHistoryStmt = db.prepare(
  'SELECT * FROM snapshots WHERE user_id = ? AND symbol = ? AND snapshot_date BETWEEN ? AND ? ORDER BY snapshot_date'
);

const getLatestSnapshotDateStmt = db.prepare(
  'SELECT MAX(snapshot_date) as latest FROM daily_totals WHERE user_id = ?'
);

const getPreviousDailyTotalStmt = db.prepare(
  'SELECT * FROM daily_totals WHERE user_id = ? AND snapshot_date < ? ORDER BY snapshot_date DESC LIMIT 1'
);

const getLatestSnapshotPricesStmt = db.prepare(`
  SELECT symbol, account_name, current_price, current_value
  FROM snapshots WHERE user_id = ? AND snapshot_date = (
    SELECT MAX(snapshot_date) FROM snapshots WHERE user_id = ?
  )
`);

export function insertSnapshot(userId, date, holding) {
  insertSnapshotStmt.run(
    userId,
    date,
    holding.symbol,
    holding.description || null,
    holding.quantity,
    holding.costBasis || null,
    holding.currentPrice || null,
    holding.currentValue || null,
    holding.accountName || null,
  );
}

export function insertDailyTotal(userId, date, totals) {
  insertDailyTotalStmt.run(
    userId,
    date,
    totals.totalValue,
    totals.totalCost,
    totals.dayGainLoss || null,
    totals.holdingsCount || null,
    totals.spyShares || 0,
  );
}

export function getDailyTotals(userId, startDate, endDate) {
  return getDailyTotalsStmt.all(userId, startDate, endDate);
}

export function getHoldingHistory(userId, symbol, startDate, endDate) {
  return getHoldingHistoryStmt.all(userId, symbol, startDate, endDate);
}

export function getLatestSnapshotDate(userId) {
  const row = getLatestSnapshotDateStmt.get(userId);
  return row ? row.latest : null;
}

export function getPreviousDailyTotal(userId, beforeDate) {
  return getPreviousDailyTotalStmt.get(userId, beforeDate) || null;
}

export function getLatestSnapshotPrices(userId) {
  return getLatestSnapshotPricesStmt.all(userId, userId);
}

export { db };
