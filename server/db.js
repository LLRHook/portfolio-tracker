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
  INSERT INTO holdings (user_id, symbol, description, quantity, cost_basis, account_name)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, symbol, account_name) DO UPDATE SET
    description = excluded.description,
    quantity = excluded.quantity,
    cost_basis = excluded.cost_basis,
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

export { db };
