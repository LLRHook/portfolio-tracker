import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../api';

const RANGES = ['1W', '1M', '3M', '6M', '1Y', 'All'];

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(v);
}

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-gray-900">{formatDate(d.date)}</p>
      {d.totalValue != null && (
        <p className="text-indigo-600">Portfolio: {formatCurrency(d.totalValue)}</p>
      )}
      {d.spValue != null && (
        <p className="text-orange-500">S&P 500: {formatCurrency(d.spValue)}</p>
      )}
      {d.dayGainLoss != null && (
        <p className={d.dayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
          {d.dayGainLoss >= 0 ? '+' : ''}{formatCurrency(d.dayGainLoss)}
        </p>
      )}
    </div>
  );
}

function SinglePointView({ data }) {
  const point = data.find(d => d.totalValue != null);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <p className="text-2xl font-semibold text-gray-900">
        {formatCurrency(point?.totalValue || 0)}
      </p>
      <p className="text-xs text-gray-500">
        {formatDate(point?.date || '')}
      </p>
      <p className="text-sm text-gray-500">
        Import more CSVs to see trends
      </p>
    </div>
  );
}

export default function PerformanceChart() {
  const [range, setRange] = useState('1M');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getHistory(range.toLowerCase());
      const { portfolio = [], benchmark = [] } = result;

      // Merge portfolio and benchmark into a single timeline for recharts
      const map = new Map();
      for (const p of portfolio) {
        map.set(p.date, { date: p.date, totalValue: p.totalValue, dayGainLoss: p.dayGainLoss });
      }
      for (const b of benchmark) {
        const existing = map.get(b.date) || { date: b.date };
        existing.spValue = b.spValue;
        map.set(b.date, existing);
      }

      const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      setData(merged);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const portfolioPointCount = useMemo(
    () => data?.filter(d => d.totalValue != null).length ?? 0,
    [data],
  );

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Portfolio Performance
        </h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                range === r
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        {loading ? (
          <div className="flex h-full flex-col justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-48 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-600">Failed to load history</p>
            <button
              onClick={fetchData}
              className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
            >
              Retry
            </button>
          </div>
        ) : portfolioPointCount === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-500">
              No historical data yet. Import a CSV to start tracking.
            </p>
          </div>
        ) : portfolioPointCount === 1 ? (
          <SinglePointView data={data} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12 }}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalValue"
                name="Portfolio"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="spValue"
                name="S&P 500"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
