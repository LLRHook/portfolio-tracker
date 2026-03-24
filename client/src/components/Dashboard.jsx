import { useState } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import ErrorBoundary from './ErrorBoundary';
import StatCards from './StatCards';
import HoldingsTable from './HoldingsTable';
import PerformanceChart from './PerformanceChart';
import AllocationChart from './AllocationChart';

export default function Dashboard({ holdings, onLogout, onImportCsv, onClearHoldings }) {
  const [clearing, setClearing] = useState(false);
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
