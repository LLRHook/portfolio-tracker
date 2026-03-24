import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  Label,
} from 'recharts';

const COLORS = [
  '#4f46e5', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#64748b',
  '#14b8a6', '#f97316',
];

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(v);
}

export default function AllocationChart({ holdings }) {
  const data = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];
    return holdings
      .filter((h) => h.currentValue > 0)
      .map((h) => ({ name: h.symbol, value: h.currentValue }));
  }, [holdings]);

  if (data.length === 0)
    return <p className="text-gray-500 text-sm">No allocation data.</p>;

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Asset Allocation
      </h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              cornerRadius={3}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  const total = data.reduce((s, d) => s + d.value, 0);
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      <tspan
                        x={viewBox.cx}
                        dy="-0.5em"
                        className="fill-gray-500 text-xs"
                      >
                        Total
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        dy="1.4em"
                        className="fill-gray-900 text-sm font-semibold"
                      >
                        {formatCurrency(total)}
                      </tspan>
                    </text>
                  );
                }}
              />
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
