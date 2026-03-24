import { useState, useMemo } from 'react';

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

export default function HoldingsTable({ holdings }) {
  const [sortKey, setSortKey] = useState('currentValue');
  const [sortAsc, setSortAsc] = useState(false);

  const totalValue = useMemo(
    () => holdings.reduce((s, h) => s + (h.currentValue || 0), 0),
    [holdings],
  );

  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      let av = a[sortKey] ?? 0;
      let bv = b[sortKey] ?? 0;
      if (sortKey === 'allocation') {
        av = a.currentValue || 0;
        bv = b.currentValue || 0;
      }
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
  }, [holdings, sortKey, sortAsc]);

  function handleSort(key) {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  if (holdings.length === 0)
    return <p className="text-gray-500 text-sm">No holdings found.</p>;

  const columns = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Qty' },
    { key: 'currentPrice', label: 'Price' },
    { key: 'currentValue', label: 'Value' },
    { key: 'dayChangePercent', label: 'Day %' },
    { key: 'gainLossPercent', label: 'Gain/Loss %' },
    { key: 'allocation', label: 'Alloc %' },
  ];

  const arrow = sortAsc ? ' \u25B2' : ' \u25BC';

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="cursor-pointer px-4 py-3 text-left font-medium text-gray-500 select-none hover:text-gray-700"
              >
                {col.label}
                {sortKey === col.key ? arrow : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((h) => {
            const alloc = totalValue > 0 ? ((h.currentValue || 0) / totalValue) * 100 : 0;
            return (
              <tr key={h.symbol} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{h.symbol}</td>
                <td className="px-4 py-3 text-gray-600">{h.description}</td>
                <td className="px-4 py-3 text-right text-gray-900">{h.quantity}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(h.currentPrice)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(h.currentValue)}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    (h.dayChangePercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {(h.dayChangePercent || 0) >= 0 ? '+' : ''}
                  {(h.dayChangePercent || 0).toFixed(2)}%
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    (h.gainLossPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {(h.gainLossPercent || 0) >= 0 ? '+' : ''}
                  {(h.gainLossPercent || 0).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {alloc.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
