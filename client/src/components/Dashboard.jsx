import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import ErrorBoundary from './ErrorBoundary';
import StatCards from './StatCards';
import HoldingsTable from './HoldingsTable';
import PerformanceChart from './PerformanceChart';
import AllocationChart from './AllocationChart';
import AlphaChart from './AlphaChart';
import ClosedPositions from './ClosedPositions';

function CollapsibleSection({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white transition"
      >
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {title}
        {count != null && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-400">{count}</span>
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function Dashboard({ holdings, closedPositions, onImportCsv, onClearHoldings }) {
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const restoreInputRef = useRef(null);
  const { addToast } = useToast();

  useEffect(() => {
    api.getHistory('1w').then(({ portfolio, benchmark }) => {
      if (portfolio.length >= 2) {
        const today = portfolio[portfolio.length - 1];
        const yesterday = portfolio[portfolio.length - 2];
        const dayChange = today.totalValue - yesterday.totalValue;
        const dayChangePercent = yesterday.totalValue ? (dayChange / yesterday.totalValue) * 100 : 0;

        const spToday = benchmark.find(b => b.date === today.date);
        const spYesterday = benchmark.find(b => b.date === yesterday.date);
        const spDayChange = spToday && spYesterday ? spToday.spValue - spYesterday.spValue : null;
        const spDayChangePercent = spYesterday?.spValue ? (spDayChange / spYesterday.spValue) * 100 : null;

        setSummary({ dayChange, dayChangePercent, spDayChange, spDayChangePercent });
      }
    }).catch(() => {});
  }, [holdings]);

  async function handleClearHoldings() {
    if (!window.confirm('Are you sure you want to delete all holdings? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.deleteHoldings();
      addToast('Holdings cleared.', 'success');
      onClearHoldings?.();
    } catch (err) {
      addToast(err.message || 'Failed to clear holdings', 'error');
    } finally {
      setClearing(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Backup downloaded.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to export backup', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleRestore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('This will replace all your current data. Continue?')) return;
    try {
      const result = await api.restoreBackup(file);
      addToast(`Restored ${result.holdings} holdings, ${result.snapshots} snapshots.`, 'success');
      onClearHoldings?.();
    } catch (err) {
      addToast(err.message || 'Failed to restore backup', 'error');
    }
  }

  const btnClass = (color) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition border ${color}`;

  return (
    <div className="min-h-screen">
      <header className="glass border-b border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/20">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <h1 className="text-base font-bold text-white">Portfolio Tracker</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onImportCsv} className={btnClass('border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20')}>
              Import CSV
            </button>
            <button onClick={handleExport} disabled={exporting}
              className={btnClass('border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50')}>
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <button onClick={() => restoreInputRef.current?.click()}
              className={btnClass('border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20')}>
              Restore
            </button>
            <input ref={restoreInputRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
            <button onClick={handleClearHoldings} disabled={clearing}
              className={btnClass('border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50')}>
              {clearing ? 'Clearing...' : 'Clear'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-6 py-4">
        <ErrorBoundary>
          <StatCards holdings={holdings} summary={summary} />
        </ErrorBoundary>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ErrorBoundary>
            <PerformanceChart compact />
          </ErrorBoundary>
          <ErrorBoundary>
            <AlphaChart compact />
          </ErrorBoundary>
          <ErrorBoundary>
            <AllocationChart holdings={holdings} compact />
          </ErrorBoundary>
        </div>

        <CollapsibleSection title="Holdings" count={holdings?.length}>
          <ErrorBoundary>
            <HoldingsTable holdings={holdings} />
          </ErrorBoundary>
        </CollapsibleSection>

        <CollapsibleSection title="Closed Positions" count={closedPositions?.length}>
          <ErrorBoundary>
            <ClosedPositions positions={closedPositions} />
          </ErrorBoundary>
        </CollapsibleSection>
      </main>
    </div>
  );
}
