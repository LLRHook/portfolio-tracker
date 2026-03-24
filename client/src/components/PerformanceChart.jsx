import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(v);
}

export default function PerformanceChart({ holdings }) {
  const data = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];
    return holdings
      .filter((h) => h.currentValue > 0)
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 10)
      .map((h) => ({ name: h.symbol, value: h.currentValue }));
  }, [holdings]);

  if (data.length === 0)
    return <p className="text-gray-500 text-sm">No performance data.</p>;

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        Holdings by Value
      </h2>
      <p className="mb-4 text-xs text-gray-400">
        Historical performance data not available with CSV import
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: 12 }}
              width={80}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(value), 'Value']}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
