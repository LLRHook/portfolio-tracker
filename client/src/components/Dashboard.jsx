import { useState, useRef } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import ErrorBoundary from './ErrorBoundary';
import StatCards from './StatCards';
import HoldingsTable from './HoldingsTable';
import PerformanceChart from './PerformanceChart';
import AllocationChart from './AllocationChart';

export default function Dashboard({ holdings, onImportCsv, onClearHoldings }) {
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const restoreInputRef = useRef(null);
  const { addToast } = useToast();

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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/20">
              <svg className="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">Portfolio Tracker</h1>
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

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <ErrorBoundary>
          <StatCards holdings={holdings} />
        </ErrorBoundary>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ErrorBoundary>
            <PerformanceChart />
          </ErrorBoundary>
          <ErrorBoundary>
            <AllocationChart holdings={holdings} />
          </ErrorBoundary>
        </div>

        <ErrorBoundary>
          <HoldingsTable holdings={holdings} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
