import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const typeStyles = {
  info: 'glass border-cyan-500/50 text-slate-200',
  success: 'glass border-emerald-500/50 text-slate-200',
  error: 'glass border-rose-500/50 text-slate-200',
  warning: 'glass border-amber-500/50 text-slate-200',
};

const iconColors = {
  info: 'text-cyan-400',
  success: 'text-emerald-400',
  error: 'text-rose-400',
  warning: 'text-amber-400',
};

function ToastItem({ toast, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 shadow-lg transition-all duration-300 ${
        typeStyles[toast.type]
      } ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      style={{ minWidth: '280px', maxWidth: '400px' }}
    >
      <span className={`text-sm font-medium ${iconColors[toast.type]}`}>
        {toast.type === 'success' && '\u2713'}
        {toast.type === 'error' && '\u2717'}
        {toast.type === 'warning' && '\u26A0'}
        {toast.type === 'info' && '\u2139'}
      </span>
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        onClick={onClose}
        className="text-slate-500 hover:text-white"
      >
        &times;
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
