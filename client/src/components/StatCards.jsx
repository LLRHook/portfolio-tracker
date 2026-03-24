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

export default function StatCards({ holdings }) {
  if (!holdings || holdings.length === 0) return null;

  const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
  const totalDayChange = holdings.reduce((s, h) => s + (h.dayChange || 0), 0);
  const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis || 0), 0);
  const totalGainLoss = holdings.reduce((s, h) => s + (h.gainLoss || 0), 0);

  const dayChangePercent = totalValue > 0 ? (totalDayChange / (totalValue - totalDayChange)) * 100 : 0;
  const gainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  const cards = [
    {
      label: 'Total Value',
      value: formatCurrency(totalValue),
      color: 'text-gray-900',
    },
    {
      label: 'Day Change',
      value: `${formatCurrency(totalDayChange)} (${formatPercent(dayChangePercent)})`,
      color: totalDayChange >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      label: 'Total Gain/Loss',
      value: `${formatCurrency(totalGainLoss)} (${formatPercent(gainLossPercent)})`,
      color: totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg bg-white p-6 shadow"
        >
          <p className="text-sm font-medium text-gray-500">{card.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${card.color}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
