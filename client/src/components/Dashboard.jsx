import { useState, useRef } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import ErrorBoundary from './ErrorBoundary';
import StatCards from './StatCards';
import HoldingsTable from './HoldingsTable';
import PerformanceChart from './PerformanceChart';
import AllocationChart from './AllocationChart';

export default function Dashboard({ holdings, onLogout, onImportCsv, onClearHoldings }) {
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const restoreInputRef = useRef(null);
  const { addToast } = useToast();

  async function handleClearHoldings() {
    if (!window.confirm('Are you sure you want to delete all holdings? This cannot be undone.')) {
      return;
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Portfolio Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={onImportCsv}
              className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
            >
              Import CSV
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export Data'}
            </button>
            <button
              onClick={() => restoreInputRef.current?.click()}
              className="rounded-md bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            >
              Restore Data
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleRestore}
            />
            <button
              onClick={handleClearHoldings}
              disabled={clearing}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              {clearing ? 'Clearing...' : 'Clear Holdings'}
            </button>
            <button
              onClick={onLogout}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
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
