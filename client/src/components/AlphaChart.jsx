import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
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
    <div className="glass rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="font-medium text-white">{formatDate(d.date)}</p>
      {d.dailyAlpha != null && (
        <p className={d.dailyAlpha >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          Daily: {d.dailyAlpha >= 0 ? '+' : ''}{formatCurrency(d.dailyAlpha)}
        </p>
      )}
      {d.cumulativeAlpha != null && (
        <p className="text-violet-400">
          Cumulative: {d.cumulativeAlpha >= 0 ? '+' : ''}{formatCurrency(d.cumulativeAlpha)}
        </p>
      )}
      {d.portfolioChange != null && (
        <p className="text-cyan-400/70 text-xs">
          Portfolio: {d.portfolioChange >= 0 ? '+' : ''}{formatCurrency(d.portfolioChange)}
        </p>
      )}
      {d.spChange != null && (
        <p className="text-orange-400/70 text-xs">
          S&P 500: {d.spChange >= 0 ? '+' : ''}{formatCurrency(d.spChange)}
        </p>
      )}
    </div>
  );
}

export default function AlphaChart({ compact }) {
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

      const spMap = new Map();
      for (const b of benchmark) {
        spMap.set(b.date, b.spValue);
      }

      const alphaData = [];
      let cumAlpha = 0;

      for (let i = 1; i < portfolio.length; i++) {
        const prev = portfolio[i - 1];
        const curr = portfolio[i];
        const portfolioChange = curr.totalValue - prev.totalValue;

        const spPrev = spMap.get(prev.date);
        const spCurr = spMap.get(curr.date);
        const spChange = spPrev != null && spCurr != null ? spCurr - spPrev : 0;

        const dailyAlpha = portfolioChange - spChange;
        cumAlpha += dailyAlpha;

        alphaData.push({
          date: curr.date,
          dailyAlpha,
          cumulativeAlpha: cumAlpha,
          portfolioChange,
          spChange,
        });
      }

      setData(alphaData);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = useMemo(() => data && data.length > 0, [data]);

  return (
    <div className={`glass ${compact ? 'rounded-xl p-3' : 'rounded-2xl p-6'}`}>
      <div className={`${compact ? 'mb-2' : 'mb-4'} flex items-center justify-between`}>
        <h2 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-white`}>
          Daily Alpha vs S&P 500
        </h2>
        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                range === r
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={compact ? 'h-52' : 'h-72'}>
        {loading ? (
          <div className="flex h-full flex-col justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
            <div className="h-48 w-full animate-pulse rounded bg-white/5" />
            <div className="h-4 w-full animate-pulse rounded bg-white/10" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-rose-400">Failed to load history</p>
            <button
              onClick={fetchData}
              className="rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 text-sm font-medium text-violet-400 transition hover:bg-violet-500/20"
            >
              Retry
            </button>
          </div>
        ) : !hasData ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-slate-500">
              Need at least 2 days of data to compute alpha.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '8px' }}
                formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Bar dataKey="dailyAlpha" name="Daily Alpha" radius={[3, 3, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.dailyAlpha >= 0 ? '#34d399' : '#fb7185'}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="cumulativeAlpha"
                name="Cumulative Alpha"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#a78bfa' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
