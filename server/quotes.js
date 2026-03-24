const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

async function fetchQuote(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo chart API ${res.status} for ${symbol}`);
  }

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result?.meta) {
    throw new Error(`No chart data for ${symbol}`);
  }

  const regularMarketPrice = result.meta.regularMarketPrice;

  // Determine previous close from the daily close array
  const closes = result.indicators?.quote?.[0]?.close || [];
  const validCloses = closes.filter(c => c != null);

  let previousClose;
  if (validCloses.length >= 2) {
    previousClose = validCloses[validCloses.length - 2];
  } else if (validCloses.length === 1) {
    // Only one close available (e.g. today's close is null for mutual funds)
    // Use that close as previous, regularMarketPrice as current
    previousClose = validCloses[0];
  } else {
    previousClose = result.meta.previousClose ?? result.meta.chartPreviousClose;
  }

  const regularMarketChange = previousClose != null ? regularMarketPrice - previousClose : null;
  const regularMarketChangePercent = previousClose ? (regularMarketChange / previousClose) * 100 : null;

  return { regularMarketPrice, regularMarketChange, regularMarketChangePercent };
}

export async function getQuotes(symbols) {
  const now = Date.now();
  const results = {};
  const toFetch = [];

  for (const symbol of symbols) {
    const cached = cache.get(symbol);
    if (cached && now - cached.timestamp < CACHE_TTL) {
      results[symbol] = cached.data;
    } else {
      toFetch.push(symbol);
    }
  }

  if (toFetch.length > 0) {
    const settled = await Promise.allSettled(
      toFetch.map(s => fetchQuote(s).then(data => ({ symbol: s, data })))
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const { symbol, data } = result.value;
        cache.set(symbol, { data, timestamp: now });
        results[symbol] = data;
      } else {
        console.error('Quote fetch failed:', result.reason.message);
      }
    }
  }

  return results;
}
