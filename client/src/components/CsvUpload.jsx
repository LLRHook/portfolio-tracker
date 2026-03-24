import { useState, useCallback, useRef } from 'react';
import { api } from '../api';
import { useToast } from './Toast';

function parseCsvPreview(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const symbolIdx = headers.findIndex((h) => /symbol|ticker/.test(h));
  const descIdx = headers.findIndex((h) => /description|name/.test(h));
  const qtyIdx = headers.findIndex((h) => /quantity|qty|shares/.test(h));
  const costIdx = headers.findIndex((h) => /cost.?basis|cost|book/i.test(h));

  if (symbolIdx === -1) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const symbol = cols[symbolIdx];
    if (!symbol) continue;
    rows.push({
      symbol,
      description: descIdx >= 0 ? cols[descIdx] : '',
      quantity: qtyIdx >= 0 ? cols[qtyIdx] : '',
      costBasis: costIdx >= 0 ? cols[costIdx] : '',
    });
  }
  return rows;
}

export default function CsvUpload({ onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const { addToast } = useToast();

  const handleFile = useCallback((f) => {
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      setError('Please select a CSV file.');
      return;
    }
    setError(null);
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCsvPreview(e.target.result);
      if (rows.length === 0) {
        setError('No valid holdings found in file. Ensure the CSV has a "Symbol" column.');
        setPreview([]);
      } else {
        setPreview(rows);
      }
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      handleFile(f);
    },
    [handleFile],
  );

  const handleImport = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.importCsv(file);
      addToast('Holdings imported successfully!', 'success');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to import CSV');
      addToast(err.message || 'Failed to import CSV', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-2xl rounded-lg bg-white p-8 shadow">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
          <svg
            className="h-8 w-8 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-center text-xl font-semibold text-gray-900">
          Import Holdings
        </h2>
        <p className="mb-6 text-center text-sm text-gray-500">
          Export your holdings from Fidelity as CSV and upload here.
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition ${
            dragOver
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50'
          }`}
        >
          <svg
            className="mb-3 h-10 w-10 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-700">
            {file ? file.name : 'Drop your CSV here or click to browse'}
          </p>
          <p className="mt-1 text-xs text-gray-500">CSV files only</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {preview.length > 0 && (
          <>
            <div className="mb-4 overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Symbol</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Description</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Quantity</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">Cost Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-gray-900">{row.symbol}</td>
                      <td className="px-3 py-2 text-gray-600">{row.description}</td>
                      <td className="px-3 py-2 text-right text-gray-900">{row.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-900">{row.costBasis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && (
                <p className="bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  ...and {preview.length - 10} more rows
                </p>
              )}
            </div>

            <button
              onClick={handleImport}
              disabled={uploading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Importing...' : `Import ${preview.length} Holdings`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
