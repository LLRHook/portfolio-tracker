import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import Dashboard from './components/Dashboard';
import CsvUpload from './components/CsvUpload';

function App() {
  const [holdings, setHoldings] = useState(null);
  const [closedPositions, setClosedPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getHoldings().then(data => {
        const list = data.holdings || data;
        return Array.isArray(list) ? list : [];
      }).catch(() => []),
      api.getClosedPositions().catch(() => []),
    ]).then(([h, cp]) => {
      setHoldings(h);
      setClosedPositions(cp);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (!holdings || holdings.length === 0 || showUpload) {
    return (
      <div className="min-h-screen">
        <CsvUpload
          onSuccess={() => {
            setShowUpload(false);
            fetchData();
          }}
        />
      </div>
    );
  }

  return (
    <Dashboard
      holdings={holdings}
      closedPositions={closedPositions}
      onImportCsv={() => setShowUpload(true)}
      onClearHoldings={() => { setHoldings([]); setClosedPositions([]); }}
    />
  );
}

export default App;
