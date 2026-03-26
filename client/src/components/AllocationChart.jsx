import { useMemo, useState } from 'react';

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
}

function gainColor(pct) {
  if (pct >= 2) return '#22c55e';
  if (pct >= 0.5) return '#16a34a';
  if (pct >= 0) return '#15803d';
  if (pct >= -0.5) return '#dc2626';
  if (pct >= -2) return '#b91c1c';
  return '#991b1b';
}

function arcPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  // Clamp to avoid full-circle edge case
  const gap = 0.02;
  const s = startAngle + gap;
  const e = endAngle - gap;
  if (e <= s) return '';

  const largeArc = e - s > Math.PI ? 1 : 0;

  const x1 = cx + outerR * Math.cos(s);
  const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e);
  const y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e);
  const y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s);
  const y4 = cy + innerR * Math.sin(s);

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export default function AllocationChart({ holdings }) {
  const [hovered, setHovered] = useState(null);

  const totalValue = useMemo(
    () => (holdings || []).reduce((s, h) => s + (h.currentValue || 0), 0),
    [holdings],
  );

  const segments = useMemo(() => {
    if (!holdings || holdings.length === 0 || totalValue === 0) return [];
    const sorted = [...holdings].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    let angle = -Math.PI / 2; // start at top
    return sorted.map((h) => {
      const pct = (h.currentValue || 0) / totalValue;
      const startAngle = angle;
      const sweep = pct * Math.PI * 2;
      angle += sweep;
      return {
        ...h,
        pct,
        startAngle,
        endAngle: startAngle + sweep,
        color: gainColor(h.dayChangePercent || 0),
      };
    });
  }, [holdings, totalValue]);

  if (!holdings || holdings.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white">Asset Allocation</h2>
        <div className="flex h-80 items-center justify-center">
          <p className="text-sm text-slate-500">No holdings to display.</p>
        </div>
      </div>
    );
  }

  const cx = 200;
  const cy = 200;
  const innerR = 70;
  const outerR = 110;
  const lineR = 116;

  // Compute label positions with collision avoidance
  const labels = useMemo(() => {
    const minSpacing = 22;
    const rawLabels = segments.map((seg) => {
      const mid = (seg.startAngle + seg.endAngle) / 2;
      const isRight = Math.cos(mid) >= 0;
      return {
        symbol: seg.symbol,
        dayChangePercent: seg.dayChangePercent || 0,
        pct: seg.pct,
        idealY: cy + 138 * Math.sin(mid),
        anchorX: cx + lineR * Math.cos(mid),
        anchorY: cy + lineR * Math.sin(mid),
        isRight,
      };
    });

    // Split into left and right, then space each side independently
    for (const side of [true, false]) {
      const group = rawLabels.filter(l => l.isRight === side).sort((a, b) => a.idealY - b.idealY);
      // Push overlapping labels apart
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1];
        const curr = group[i];
        if (curr.idealY - prev.idealY < minSpacing) {
          curr.idealY = prev.idealY + minSpacing;
        }
      }
      // If labels overflow bottom, shift entire group up
      if (group.length > 0) {
        const overflow = group[group.length - 1].idealY - (cy + 180);
        if (overflow > 0) {
          for (const l of group) l.idealY -= overflow;
        }
      }
    }
    return rawLabels;
  }, [segments]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Asset Allocation</h2>
        <span className="text-sm text-slate-400">{formatCurrency(totalValue)}</span>
      </div>

      <div className="flex justify-center">
        <svg viewBox="0 0 400 400" className="w-full max-w-[400px] h-auto">
          {/* Segments */}
          {segments.map((seg) => {
            const isHovered = hovered === seg.symbol;
            const r = isHovered ? outerR + 6 : outerR;
            return (
              <path
                key={seg.symbol}
                d={arcPath(cx, cy, innerR, r, seg.startAngle, seg.endAngle)}
                fill={seg.color}
                opacity={hovered && !isHovered ? 0.4 : 1}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={1}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHovered(seg.symbol)}
                onMouseLeave={() => setHovered(null)}
                style={{ filter: isHovered ? 'brightness(1.3)' : undefined }}
              />
            );
          })}

          {/* Label lines + text (collision-free) */}
          {labels.map((label) => {
            const tx = label.isRight ? cx + 145 : cx - 145;
            const elbowX = label.isRight ? cx + 130 : cx - 130;
            const isHov = hovered === label.symbol;
            const dayPct = label.dayChangePercent;

            return (
              <g key={`label-${label.symbol}`} opacity={hovered && !isHov ? 0.4 : 1} className="transition-opacity duration-200">
                {/* Line from arc to elbow to label */}
                <polyline
                  points={`${label.anchorX},${label.anchorY} ${elbowX},${label.idealY} ${tx},${label.idealY}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                />
                <text
                  x={tx + (label.isRight ? 4 : -4)} y={label.idealY - 4}
                  textAnchor={label.isRight ? 'start' : 'end'}
                  fill="white"
                  fontSize="10.5"
                  fontWeight="600"
                >
                  {label.symbol}
                </text>
                <text
                  x={tx + (label.isRight ? 4 : -4)} y={label.idealY + 9}
                  textAnchor={label.isRight ? 'start' : 'end'}
                  fill={dayPct >= 0 ? '#4ade80' : '#f87171'}
                  fontSize="9"
                >
                  {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}% · {(label.pct * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* Center text */}
          <text x={cx} y={cy - 8} textAnchor="middle" fill="#94a3b8" fontSize="11">
            Total
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="white" fontSize="16" fontWeight="700">
            {formatCurrency(totalValue)}
          </text>
        </svg>
      </div>

      {/* Hover detail card */}
      {hovered && (() => {
        const seg = segments.find(s => s.symbol === hovered);
        if (!seg) return null;
        const dayPct = seg.dayChangePercent || 0;
        return (
          <div className="glass rounded-lg px-4 py-3 mt-3 flex items-center justify-between">
            <div>
              <span className="font-bold text-white text-sm">{seg.symbol}</span>
              <span className="text-slate-400 text-xs ml-2">{seg.description}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className={dayPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}%
              </span>
              <span className="text-white font-medium">{formatCurrency(seg.currentValue)}</span>
              <span className="text-slate-400">{(seg.pct * 100).toFixed(1)}%</span>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {segments.map((seg) => (
          <div
            key={seg.symbol}
            className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer hover:text-white transition"
            onMouseEnter={() => setHovered(seg.symbol)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            {seg.symbol}
          </div>
        ))}
      </div>
    </div>
  );
}
