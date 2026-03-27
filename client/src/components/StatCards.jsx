function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export default function StatCards({ holdings, summary }) {
  if (!holdings || holdings.length === 0) return null;

  const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
  const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis || 0) * (h.quantity || 0), 0);
  const totalGainLoss = holdings.reduce((s, h) => s + (h.gainLoss || 0), 0);

  const totalDayChange = summary?.dayChange ?? 0;
  const dayChangePercent = summary?.dayChangePercent ?? 0;
  const spDayChange = summary?.spDayChange;
  const spDayChangePercent = summary?.spDayChangePercent;

  const gainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  const cards = [
    {
      label: 'Total Value',
      value: formatCurrency(totalValue),
      color: 'text-white',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
      accent: 'bg-cyan-500/20 text-cyan-400',
    },
    {
      label: 'Day Change',
      value: `${formatCurrency(totalDayChange)} (${formatPercent(dayChangePercent)})`,
      subValue: spDayChange != null ? `S&P 500: ${formatCurrency(spDayChange)} (${formatPercent(spDayChangePercent)})` : null,
      color: totalDayChange >= 0 ? 'text-emerald-400' : 'text-rose-400',
      subColor: spDayChange != null ? (spDayChange >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70') : null,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={totalDayChange >= 0 ? "M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" : "M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181"} />
        </svg>
      ),
      accent: totalDayChange >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400',
    },
    {
      label: 'Total Gain/Loss',
      value: `${formatCurrency(totalGainLoss)} (${formatPercent(gainLossPercent)})`,
      color: totalGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      ),
      accent: totalGainLoss >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass glass-hover rounded-2xl p-6 transition"
        >
          <div className="mb-3 flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.accent}`}>
              {card.icon}
            </div>
            <p className="text-sm font-medium text-slate-400">{card.label}</p>
          </div>
          <p className={`text-2xl font-semibold ${card.color}`}>
            {card.value}
          </p>
          {card.subValue && (
            <p className={`mt-1 text-sm ${card.subColor}`}>
              {card.subValue}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
