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
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  if (holdings.length === 0)
    return <p className="text-slate-500 text-sm">No holdings found.</p>;

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
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="min-w-full divide-y divide-white/5 text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 select-none hover:text-cyan-400 transition"
              >
                {col.label}
                {sortKey === col.key ? <span className="text-cyan-400">{arrow}</span> : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((h) => {
            const alloc = totalValue > 0 ? ((h.currentValue || 0) / totalValue) * 100 : 0;
            return (
              <tr key={h.symbol} className="transition hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-medium text-cyan-400">{h.symbol}</td>
                <td className="px-4 py-3 text-slate-300">{h.description}</td>
                <td className="px-4 py-3 text-right text-slate-200">{h.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-200">{formatCurrency(h.currentPrice)}</td>
                <td className="px-4 py-3 text-right text-white font-medium">{formatCurrency(h.currentValue)}</td>
                <td className={`px-4 py-3 text-right font-medium ${(h.dayChangePercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(h.dayChangePercent || 0) >= 0 ? '+' : ''}
                  {(h.dayChangePercent || 0).toFixed(2)}%
                </td>
                <td className={`px-4 py-3 text-right font-medium ${(h.gainLossPercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(h.gainLossPercent || 0) >= 0 ? '+' : ''}
                  {(h.gainLossPercent || 0).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
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
