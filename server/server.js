import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { getQuotes } from './quotes.js';
import {
  upsertHolding, getHoldings, deleteHoldings, hasHoldings,
  createUser, findUser, getUserCount,
  insertSnapshot, insertDailyTotal, getDailyTotals, getHoldingHistory,
} from './db.js';

const app = express();
const PORT = process.env.PORT || 34892;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:34891', credentials: true }));
app.use(express.json());

// --- Session middleware ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set true behind HTTPS in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// --- Seed default user on startup ---
async function seedDefaultUser() {
  if (getUserCount() === 0) {
    const hash = await bcrypt.hash('admin', 12);
    createUser('admin', hash);
    console.log('Default user created: admin / admin');
  }
}
seedDefaultUser();

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Authentication required' });
}

// Public routes: login, health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = findUser(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// --- Protected routes ---
app.use('/api', requireAuth);

function getUserId(req) {
  return req.session.username || 'default-user';
}

app.get('/api/status', (req, res) => {
  const userId = getUserId(req);
  const linked = hasHoldings(userId);
  res.json({ linked, username: req.session.username });
});

// --- CSV Import ---
function stripMoney(str) {
  if (!str) return '';
  return str.replace(/[$,%+"]/g, '').trim();
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseFidelityCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const colIndex = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const colIncludes = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

  const acctNumIdx = colIndex('Account Number');
  const acctNameIdx = colIndex('Account Name');
  const symbolIdx = colIndex('Symbol');
  const descIdx = colIndex('Description');
  const qtyIdx = colIndex('Quantity');
  const currentValueIdx = colIncludes('Current Value');
  const lastPriceIdx = colIncludes('Last Price');
  const avgCostIdx = colIndex('Average Cost Basis');

  if (symbolIdx === -1) return { holdings: [], snapshotDate: new Date().toISOString().split('T')[0] };

  const holdings = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);

    // Skip rows without a valid Account Number (disclaimers, footers)
    const acctNum = acctNumIdx >= 0 ? (fields[acctNumIdx] || '').trim() : '';
    if (!acctNum || !/^\d+$/.test(acctNum)) continue;

    let symbol = (fields[symbolIdx] || '').replace(/^"|"$/g, '').trim();
    if (!symbol || symbol.startsWith('**') || symbol.toLowerCase() === 'symbol') continue;

    // Strip trailing asterisks (e.g. SPAXX**)
    symbol = symbol.replace(/\*+$/, '');

    const qtyStr = stripMoney(fields[qtyIdx] || '');
    let quantity = parseFloat(qtyStr);

    const currentValueStr = stripMoney(fields[currentValueIdx] || '');
    const currentValue = parseFloat(currentValueStr);

    // Money market positions (no quantity/price) — store as quantity=1, costBasis=currentValue
    if (isNaN(quantity) || quantity === 0) {
      if (!isNaN(currentValue) && currentValue > 0) {
        quantity = 1;
      } else {
        continue;
      }
    }

    const avgCostStr = avgCostIdx >= 0 ? stripMoney(fields[avgCostIdx] || '') : '';
    let costBasis = avgCostStr ? parseFloat(avgCostStr) : null;
    if (isNaN(costBasis)) costBasis = null;

    // For money market (quantity forced to 1), use currentValue as cost basis
    if (quantity === 1 && costBasis == null && !isNaN(currentValue)) {
      costBasis = currentValue;
    }

    const lastPriceStr = lastPriceIdx >= 0 ? stripMoney(fields[lastPriceIdx] || '') : '';
    let currentPrice = lastPriceStr ? parseFloat(lastPriceStr) : null;
    if (isNaN(currentPrice)) currentPrice = null;

    // For money market positions (quantity=1), set currentPrice = currentValue
    if (quantity === 1 && currentPrice == null && !isNaN(currentValue)) {
      currentPrice = currentValue;
    }

    holdings.push({
      symbol,
      description: descIdx >= 0 ? (fields[descIdx] || '').replace(/^"|"$/g, '').trim() : null,
      quantity,
      costBasis,
      currentPrice,
      currentValue: !isNaN(currentValue) ? currentValue : null,
      accountName: acctNameIdx >= 0 ? (fields[acctNameIdx] || '').replace(/^"|"$/g, '').trim() : null,
    });
  }

  // Extract snapshot date from CSV footer (e.g. "Date downloaded Mar-24-2026")
  let snapshotDate = new Date().toISOString().split('T')[0];
  const months = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                   Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/Date downloaded\s+(\w{3})-(\d{2})-(\d{4})/i);
    if (match) {
      const [, mon, day, year] = match;
      const mm = months[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()];
      if (mm) {
        snapshotDate = `${year}-${mm}-${day}`;
      }
      break;
    }
  }

  return { holdings, snapshotDate };
}

app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const { holdings, snapshotDate } = parseFidelityCsv(csvText);

    if (holdings.length === 0) {
      return res.status(400).json({ error: 'No valid holdings found in CSV' });
    }

    const userId = getUserId(req);
    // Clear existing holdings so sold positions don't linger
    deleteHoldings(userId);
    for (const holding of holdings) {
      upsertHolding(userId, holding);
      insertSnapshot(userId, snapshotDate, holding);
    }

    // Compute and store daily totals
    let totalValue = 0;
    let totalCost = 0;
    for (const h of holdings) {
      totalValue += (h.currentValue || 0);
      totalCost += ((h.costBasis || 0) * h.quantity);
    }
    insertDailyTotal(userId, snapshotDate, {
      totalValue,
      totalCost,
      dayGainLoss: totalValue - totalCost,
      holdingsCount: holdings.length,
    });

    res.json({ imported: holdings.length, snapshotDate });
  } catch (err) {
    console.error('Import error:', err.message);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// --- Holdings with live quotes ---
app.get('/api/holdings', async (req, res) => {
  try {
    const userId = getUserId(req);
    const rows = getHoldings(userId);

    if (rows.length === 0) {
      return res.json([]);
    }

    // Cash/money market positions (quantity=1, stored as lump sum) don't need quotes
    const isCashPosition = (row) => row.quantity === 1 && row.description?.toUpperCase().includes('MONEY MARKET');
    const symbols = [...new Set(rows.filter(r => !isCashPosition(r)).map(r => r.symbol))];

    // Fetch live quotes for non-cash positions
    let quotesMap = {};
    try {
      if (symbols.length > 0) {
        quotesMap = await getQuotes(symbols);
      }
    } catch (quoteErr) {
      console.error('Quote fetch error:', quoteErr.message);
    }

    const result = rows.map(row => {
      if (isCashPosition(row)) {
        const value = row.cost_basis || 0;
        return {
          symbol: row.symbol,
          description: row.description,
          quantity: row.quantity,
          costBasis: value,
          accountName: row.account_name,
          currentPrice: value,
          currentValue: value,
          dayChange: 0,
          dayChangePercent: 0,
          gainLoss: 0,
          gainLossPercent: 0,
        };
      }

      const q = quotesMap[row.symbol] || {};
      const currentPrice = q.regularMarketPrice || null;
      const currentValue = currentPrice != null ? currentPrice * row.quantity : null;
      const costBasis = row.cost_basis;
      const totalCost = costBasis != null ? costBasis * row.quantity : null;
      const gainLoss = currentValue != null && totalCost != null ? currentValue - totalCost : null;
      const gainLossPercent = gainLoss != null && totalCost ? (gainLoss / totalCost) * 100 : null;

      return {
        symbol: row.symbol,
        description: row.description,
        quantity: row.quantity,
        costBasis,
        accountName: row.account_name,
        currentPrice,
        currentValue,
        dayChange: q.regularMarketChange || null,
        dayChangePercent: q.regularMarketChangePercent || null,
        gainLoss,
        gainLossPercent,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching holdings:', err.message);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

app.delete('/api/holdings', (req, res) => {
  try {
    const userId = getUserId(req);
    deleteHoldings(userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting holdings:', err.message);
    res.status(500).json({ error: 'Failed to delete holdings' });
  }
});

// --- History endpoints ---
app.get('/api/history', (req, res) => {
  const userId = getUserId(req);
  const range = req.query.range || '1m';
  const endDate = new Date().toISOString().split('T')[0];

  const ranges = { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
  let startDate;
  if (range === 'all') {
    startDate = '2000-01-01';
  } else {
    const d = new Date();
    d.setDate(d.getDate() - (ranges[range] || 30));
    startDate = d.toISOString().split('T')[0];
  }

  const rows = getDailyTotals(userId, startDate, endDate);
  res.json(rows.map(r => ({
    date: r.snapshot_date,
    totalValue: r.total_value,
    totalCost: r.total_cost,
    dayGainLoss: r.day_gain_loss,
    holdingsCount: r.holdings_count,
  })));
});

app.get('/api/history/:symbol', (req, res) => {
  const userId = getUserId(req);
  const { symbol } = req.params;
  const range = req.query.range || '1m';
  const endDate = new Date().toISOString().split('T')[0];

  const ranges = { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
  let startDate;
  if (range === 'all') {
    startDate = '2000-01-01';
  } else {
    const d = new Date();
    d.setDate(d.getDate() - (ranges[range] || 30));
    startDate = d.toISOString().split('T')[0];
  }

  const rows = getHoldingHistory(userId, symbol, startDate, endDate);
  res.json(rows.map(r => ({
    date: r.snapshot_date,
    quantity: r.quantity,
    costBasis: r.cost_basis,
    currentPrice: r.current_price,
    currentValue: r.current_value,
  })));
});

export { app };

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
