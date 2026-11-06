import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export class CsvImportError extends Error {}

const defaultBinary = fileURLToPath(new URL(`./bin/portfolio-fidelity-csv${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const maxOutputBytes = 64 * 1024 * 1024;

// One native process per whole upload. CSV stays on stdin, never argv or disk.
// There is no JavaScript parser fallback: missing/broken binaries are server errors.
export function parseFidelityCsv(csvText) {
  return new Promise((resolve, reject) => {
    const binary = process.env.FIDELITY_CSV_BIN || defaultBinary;
    const today = new Date().toISOString().slice(0, 10);
    const child = spawn(binary, ['--today', today], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let outputBytes = 0;
    const chunks = [];
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result);
    };
    const stop = message => {
      child.kill('SIGKILL');
      finish(new Error(message));
    };
    const timeout = setTimeout(() => stop('CSV processor timed out'), 30_000);
    timeout.unref();
    child.once('error', () => finish(new Error('CSV processor could not start; run npm run build:csv')));
    // Consume stderr without logging potentially sensitive native diagnostics.
    child.stderr.resume();
    child.stdout.on('data', chunk => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) return stop('CSV processor output exceeded the supported size');
      chunks.push(chunk);
    });
    // A crashed peer can close stdin early; its close/error event decides failure.
    child.stdin.on('error', () => {});
    child.once('close', (code) => {
      if (settled) return;
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return finish(new Error('CSV processor returned an invalid response'));
      }
      if (code === 2 && parsed && typeof parsed.error === 'string') {
        return finish(new CsvImportError(parsed.error));
      }
      if (code !== 0 || !parsed || !Array.isArray(parsed.holdings) ||
          typeof parsed.snapshotDate !== 'string') {
        return finish(new Error('CSV processor failed'));
      }
      finish(null, parsed);
    });
    child.stdin.end(csvText, 'utf8');
  });
}
