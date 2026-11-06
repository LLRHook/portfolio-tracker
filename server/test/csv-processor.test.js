import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CsvImportError, parseFidelityCsv } from '../fidelity-csv.js';

const binary = fileURLToPath(new URL(`../bin/portfolio-fidelity-csv${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));

test('native CLI validates invocation and sends parse errors on the JSON channel', () => {
  const badArgs = spawnSync(binary, ['--today', '2026-02-31'], { input: '', encoding: 'utf8' });
  assert.equal(badArgs.status, 1);
  assert.equal(badArgs.stdout, '');
  assert.equal(badArgs.stderr.trim(), 'CSV processor I/O or invocation failed');
  const invalidCsv = spawnSync(binary, ['--today', '2026-11-06'], { input: 'Synthetic invalid CSV', encoding: 'utf8' });
  assert.equal(invalidCsv.status, 2);
  assert.deepEqual(JSON.parse(invalidCsv.stdout), { error: 'Missing required CSV column: Account Number' });
  assert.equal(invalidCsv.stderr, '');
});

test('native CLI uses the caller-supplied UTC date when no download date matches', () => {
  const result = spawnSync(binary, ['--today', '2024-02-29'], {
    input: 'Account Number,Symbol,Quantity,Current Value\nA,TEST,1,2', encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).snapshotDate, '2024-02-29');
});

test('missing native executable rejects without falling back to JavaScript', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-csv-missing-'));
  const previous = process.env.FIDELITY_CSV_BIN;
  process.env.FIDELITY_CSV_BIN = path.join(directory, 'missing');
  try {
    await assert.rejects(() => parseFidelityCsv('Synthetic CSV'), error => {
      assert.ok(!(error instanceof CsvImportError));
      assert.match(error.message, /could not start/);
      return true;
    });
  } finally {
    if (previous === undefined) delete process.env.FIDELITY_CSV_BIN;
    else process.env.FIDELITY_CSV_BIN = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [name, source] of [
  ['invalid JSON', "process.stdout.write('not json')"],
  ['partial success with a failing exit', "console.log(JSON.stringify({holdings:[],snapshotDate:'2026-11-06'}));process.exitCode=1"],
  ['invalid success shape', "console.log(JSON.stringify({holdings:null,snapshotDate:'2026-11-06'}))"],
  ['invalid validation response', "console.log(JSON.stringify({error:42}));process.exitCode=2"],
  ['signal exit', "process.kill(process.pid,'SIGTERM')"],
]) {
  test(`treat ${name} as a processor failure, not a CSV validation error`, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-csv-peer-'));
    const peer = path.join(directory, 'peer');
    writeFileSync(peer, `#!${process.execPath}\nprocess.stdin.resume();\n${source}\n`);
    chmodSync(peer, 0o755);
    const previous = process.env.FIDELITY_CSV_BIN;
    process.env.FIDELITY_CSV_BIN = peer;
    try {
      await assert.rejects(() => parseFidelityCsv('Synthetic CSV'), error => {
        assert.ok(!(error instanceof CsvImportError));
        assert.match(error.message, /CSV processor/);
        assert.ok(!error.message.includes('Synthetic CSV'));
        return true;
      });
    } finally {
      if (previous === undefined) delete process.env.FIDELITY_CSV_BIN;
      else process.env.FIDELITY_CSV_BIN = previous;
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
