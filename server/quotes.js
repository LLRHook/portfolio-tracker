const MAX_CACHE_ENTRIES = 20;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const cache = new Map();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function fetchSpyChart(period1, period2) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/SPY?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Yahoo SPY fetch failed: ${res.status}`);

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('No SPY chart data');
  return result;
}

/**
 * Fetch SPY closing price for a specific date.
 * Looks back 6 days to handle weekends/holidays.
 */
export async function fetchSpyPriceOnDate(dateStr) {
  const target = new Date(dateStr + 'T20:00:00Z');
  const period2 = Math.floor(target.getTime() / 1000) + 86400;
  const period1 = period2 - 6 * 86400;

  const result = await fetchSpyChart(period1, period2);
  const closes = result.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter(c => c != null);
  if (validCloses.length === 0) throw new Error('No SPY close prices found');

  return validCloses[validCloses.length - 1];
}

/**
 * Fetch SPY historical daily closes for a date range.
 * Returns array of { date: "YYYY-MM-DD", close: number }.
 */
export async function fetchSpyHistory(startDate, endDate) {
  const cacheKey = `${startDate}:${endDate}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const period1 = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
  const period2 = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);

  const result = await fetchSpyChart(period1, period2);
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const data = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      const d = new Date(timestamps[i] * 1000);
      data.push({ date: d.toISOString().split('T')[0], close: closes[i] });
    }
  }

  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
