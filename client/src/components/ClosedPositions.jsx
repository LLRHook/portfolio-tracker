import { useState } from 'react';

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

export default function ClosedPositions({ positions }) {
  const [expanded, setExpanded] = useState(false);

  if (!positions || positions.length === 0) return null;

  return (
    <div className="glass rounded-2xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Closed Positions</h2>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-400">
            {positions.length}
          </span>
        </div>
        <svg
          className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-white/5">
          <table className="min-w-full divide-y divide-white/5 text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Symbol</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Cost Basis</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Last Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Est. Gain/Loss</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {positions.map((p, i) => {
                const gainLoss = (p.lastPrice && p.costBasis)
                  ? (p.lastPrice - p.costBasis) * p.quantity
                  : null;
                return (
                  <tr key={`${p.symbol}-${p.closeDate}-${i}`} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium text-slate-300">{p.symbol}</td>
                    <td className="px-4 py-3 text-slate-400">{p.description}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{p.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {p.costBasis != null ? formatCurrency(p.costBasis) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {p.lastPrice != null ? formatCurrency(p.lastPrice) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      gainLoss == null ? 'text-slate-500' : gainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {gainLoss != null ? `${gainLoss >= 0 ? '+' : ''}${formatCurrency(gainLoss)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{p.closeDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
