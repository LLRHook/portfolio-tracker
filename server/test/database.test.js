import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

for (const entrypoint of ['-', 'missing-entrypoint.js']) {
  test(`import the app with a non-file entrypoint ${entrypoint} without listening or seeding`, () => {
    const source = `
      import assert from 'node:assert/strict';
      import express from 'express';
      express.application.listen = () => { throw new Error('Import started a listener'); };
      process.argv[1] = ${JSON.stringify(entrypoint)};
      const { app } = await import('./server.js');
      const { db, getUserCount } = await import('./db.js');
      assert.equal(typeof app.listen, 'function');
      assert.equal(getUserCount(), 0, 'Import seeded a user');
      db.close();
      console.log('App imported without startup side effects');
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-'], {
      input: source,
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, DATABASE_PATH: ':memory:', DOTENV_CONFIG_PATH: '/dev/null' },
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    });
    assert.equal(output.trim(), 'App imported without startup side effects');
  });
}

for (const legacy of [false, true]) {
  test(`${legacy ? 'upgrade a legacy' : 'initialize a fresh'} database with benchmark shares`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-schema-'));
    const databasePath = path.join(directory, 'fixture.db');
    try {
      if (legacy) {
        const db = new Database(databasePath);
        db.exec(`CREATE TABLE daily_totals (
          id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, snapshot_date TEXT NOT NULL,
          total_value REAL NOT NULL, total_cost REAL NOT NULL, day_gain_loss REAL,
          holdings_count INTEGER, UNIQUE(user_id, snapshot_date)
        ); INSERT INTO daily_totals (user_id, snapshot_date, total_value, total_cost)
          VALUES ('fixture', '2026-10-21', 125, 100)`);
        db.close();
      }
      // Separate processes also verify initialization remains safe after a restart.
      for (let run = 0; run < 2; run++) {
        execFileSync(process.execPath, ['--input-type=module', '-e', `
          import { db, insertDailyTotal, getDailyTotals } from './db.js';
          insertDailyTotal('fixture', '2026-10-22', { totalValue: 150, totalCost: 100, spyShares: 0.25 });
          const rows = getDailyTotals('fixture', '2026-10-21', '2026-10-22');
          if (rows.at(-1).spy_shares !== 0.25) throw new Error('Benchmark shares lost');
          db.close();
        `], {
          cwd: new URL('..', import.meta.url),
          env: { ...process.env, DATABASE_PATH: databasePath },
          stdio: 'pipe',
        });
      }
      const db = new Database(databasePath);
      const rows = db.prepare('SELECT * FROM daily_totals ORDER BY snapshot_date').all();
      db.close();
      assert.equal(rows.length, legacy ? 2 : 1);
      if (legacy) assert.equal(rows[0].spy_shares, 0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('boot the server from a symlinked checkout with an isolated fresh database', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-boot-'));
  const checkout = path.join(directory, 'server');
  const envPath = path.join(directory, 'empty.env');
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), checkout, 'dir');
  writeFileSync(envPath, '');
  const child = spawn(process.execPath, [path.join(checkout, 'server.js')], {
    env: { ...process.env, DATABASE_PATH: ':memory:', DOTENV_CONFIG_PATH: envPath, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server did not listen within 5 seconds')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes('Server running on')) { clearTimeout(timeout); resolve(); }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited before listening: ${code}`)); });
    });
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode != null || child.signalCode != null) resolve();
      else child.once('exit', resolve);
    });
    rmSync(directory, { recursive: true, force: true });
  }
});
