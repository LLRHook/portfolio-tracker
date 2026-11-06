import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read Cargo's artifact path: supports CARGO_TARGET_DIR and cross-platform paths.
const manifest = fileURLToPath(new URL('../rust/fidelity-csv/Cargo.toml', import.meta.url));
const result = spawnSync('cargo', [
  'build', '--release', '--locked', '--manifest-path', manifest,
  '--message-format=json-render-diagnostics',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
if (result.error || result.status !== 0) {
  console.error('Failed to build CSV processor. Install Rust 1.93+ and run npm run build:csv.');
  process.exit(1);
}
const artifacts = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
const binary = artifacts.findLast(item => item.reason === 'compiler-artifact' &&
  item.target.name === 'portfolio-fidelity-csv' && item.executable)?.executable;
if (!binary) throw new Error('Cargo did not report a CSV processor executable');
const directory = new URL('../bin/', import.meta.url);
mkdirSync(directory, { recursive: true });
const destination = new URL(`portfolio-fidelity-csv${process.platform === 'win32' ? '.exe' : ''}`, directory);
copyFileSync(binary, destination);
chmodSync(destination, 0o755);
console.log('Built native CSV processor');
