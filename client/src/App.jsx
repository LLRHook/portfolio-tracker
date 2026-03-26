import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import Dashboard from './components/Dashboard';
import CsvUpload from './components/CsvUpload';

function App() {
  const [holdings, setHoldings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchHoldings = useCallback(() => {
    setLoading(true);
    api
      .getHoldings()
      .then((data) => {
        const list = data.holdings || data;
        setHoldings(Array.isArray(list) ? list : []);
      })
      .catch(() => setHoldings([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

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
            fetchHoldings();
          }}
        />
      </div>
    );
  }

  return (
    <Dashboard
      holdings={holdings}
      onImportCsv={() => setShowUpload(true)}
      onClearHoldings={() => setHoldings([])}
    />
  );
}

export default App;
