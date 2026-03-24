const BASE_URL = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (username, password) =>
    request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/logout', { method: 'POST' }),
  status: () => request('/status'),

  // Portfolio data
  getHoldings: () => request('/holdings'),

  // CSV import (multipart/form-data — no JSON content-type)
  importCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to import CSV');
    }
    return res.json();
  },

  // Delete all holdings
  deleteHoldings: () => request('/holdings', { method: 'DELETE' }),

  // History
  getHistory: (range = '1m') => request(`/history?range=${range}`),
  getSymbolHistory: (symbol, range = '1m') => request(`/history/${encodeURIComponent(symbol)}?range=${range}`),
};
