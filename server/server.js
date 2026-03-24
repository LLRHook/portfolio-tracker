import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import bcrypt from 'bcrypt';
import multer from 'multer';
import yahooFinance from 'yahoo-finance2';
import {
  upsertHolding, getHoldings, deleteHoldings, hasHoldings,
  createUser, findUser, getUserCount,
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
  const avgCostIdx = colIndex('Average Cost Basis');

  if (symbolIdx === -1) return [];

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

    holdings.push({
      symbol,
      description: descIdx >= 0 ? (fields[descIdx] || '').replace(/^"|"$/g, '').trim() : null,
      quantity,
      costBasis,
      accountName: acctNameIdx >= 0 ? (fields[acctNameIdx] || '').replace(/^"|"$/g, '').trim() : null,
    });
  }
  return holdings;
}

app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const holdings = parseFidelityCsv(csvText);

    if (holdings.length === 0) {
      return res.status(400).json({ error: 'No valid holdings found in CSV' });
    }

    const userId = getUserId(req);
    for (const holding of holdings) {
      upsertHolding(userId, holding);
    }

    res.json({ imported: holdings.length });
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

    const symbols = [...new Set(rows.map(r => r.symbol))];

    // Fetch live quotes from Yahoo Finance
    let quotesMap = {};
    try {
      const quotes = await yahooFinance.quote(symbols, { return: 'object' });
      quotesMap = quotes || {};
    } catch (quoteErr) {
      console.error('Yahoo Finance quote error:', quoteErr.message);
    }

    const result = rows.map(row => {
      const q = quotesMap[row.symbol] || {};
      const currentPrice = q.regularMarketPrice || null;
      const currentValue = currentPrice != null ? currentPrice * row.quantity : null;
      const costBasis = row.cost_basis; // per-share average cost basis
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

export { app };

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
