import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
      <p className="text-gray-600">Value: {formatCurrency(d.totalValue)}</p>
      <p className={d.dayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
        {d.dayGainLoss >= 0 ? '+' : ''}{formatCurrency(d.dayGainLoss)}
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
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        ) : !data || data.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-gray-500">
              No historical data yet. Import a CSV to start tracking.
            </p>
          </div>
        ) : data.length === 1 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(data[0].totalValue)}
            </p>
            <p className="text-xs text-gray-500">{formatDate(data[0].date)}</p>
            <p className="text-sm text-gray-500">
              Import more CSVs to see trends
            </p>
          </div>
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
              <Line
                type="monotone"
                dataKey="totalValue"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
