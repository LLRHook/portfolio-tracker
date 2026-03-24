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
  info: 'bg-white border-indigo-500 text-gray-900',
  success: 'bg-white border-green-500 text-gray-900',
  error: 'bg-white border-red-500 text-gray-900',
  warning: 'bg-white border-yellow-500 text-gray-900',
};

const iconColors = {
  info: 'text-indigo-500',
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
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
        className="text-gray-400 hover:text-gray-600"
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
