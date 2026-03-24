import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './api';
import Dashboard from './components/Dashboard';
import CsvUpload from './components/CsvUpload';
import Login from './components/Login';

function App() {
  const { user, checked, logout } = useAuth();
  const [holdings, setHoldings] = useState(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (user) {
      setLoadingHoldings(true);
      api
        .getHoldings()
        .then((data) => {
          const list = data.holdings || data;
          setHoldings(Array.isArray(list) ? list : []);
        })
        .catch(() => setHoldings([]))
        .finally(() => setLoadingHoldings(false));
    } else {
      setHoldings(null);
      setShowUpload(false);
    }
  }, [user]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (loadingHoldings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!holdings || holdings.length === 0 || showUpload) {
    return (
      <div className="min-h-screen bg-gray-50">
        <CsvUpload
          onSuccess={() => {
            setShowUpload(false);
            setLoadingHoldings(true);
            api
              .getHoldings()
              .then((data) => {
                const list = data.holdings || data;
                setHoldings(Array.isArray(list) ? list : []);
              })
              .catch(() => setHoldings([]))
              .finally(() => setLoadingHoldings(false));
          }}
        />
      </div>
    );
  }

  return (
    <Dashboard
      holdings={holdings}
      onLogout={logout}
      onImportCsv={() => setShowUpload(true)}
      onClearHoldings={() => setHoldings([])}
    />
  );
}

export default App;
