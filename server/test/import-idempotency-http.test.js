import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const secret = 'synthetic-import-session-secret';
const header = 'Account Number,Account Name,Symbol,Quantity,Last Price,Current Value,Average Cost Basis';
function csv(account = '', symbol = 'TEST', day = 21, quantity = 2) {
  const fields = ['SYNTHETIC123', account, symbol, quantity, 10, quantity * 10, 8];
  return `${header}\n${fields.join(',')}\nDate downloaded Oct-${day}-2026`;
}
function missingAccountCsv(symbol = 'TEST', day = 21) {
  return csv('', symbol, day).split('\n').map((line, i) => i < 2 ? line.split(',').filter((_, column) => column !== 1).join(',') : line).join('\n');
}

function cookie(user) {
  const signature = createHmac('sha256', secret).update(user).digest('base64').replace(/=+$/, '');
  return `connect.sid=${encodeURIComponent(`s:${user}.${signature}`)}`;
}

async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-http-idempotency-'));
  const envPath = path.join(directory, 'empty.env');
  writeFileSync(envPath, '');
  const children = new Set();
  t.after(async () => {
    await Promise.all([...children].map(server => server.close()));
    rmSync(directory, { recursive: true, force: true });
  });

  async function start() {
    const child = spawn(process.execPath, ['test-support/import-server.js'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env, NODE_ENV: 'test', DATABASE_PATH: path.join(directory, 'fixture.db'),
        DOTENV_CONFIG_PATH: envPath, ENCRYPTION_KEY: '12'.repeat(32), SESSION_SECRET: secret,
        FIDELITY_CSV_BIN: fileURLToPath(new URL('../bin/portfolio-fidelity-csv', import.meta.url)),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const events = new Map();
    const waiters = new Map();
    child.on('message', message => {
      const key = message.event === 'ack' ? `ack-${message.id}` : message.event;
      if (waiters.has(key)) { waiters.get(key).resolve(message); waiters.delete(key); }
      else events.set(key, message);
    });
    child.on('error', error => { for (const waiter of waiters.values()) waiter.reject(error); });
    const exited = once(child, 'exit');
    child.on('exit', code => {
      for (const waiter of waiters.values()) waiter.reject(new Error(`Fixture exited ${code}: ${stderr}`));
    });
    function wait(key) {
      if (events.has(key)) { const value = events.get(key); events.delete(key); return Promise.resolve(value); }
      return new Promise((resolve, reject) => { waiters.set(key, { resolve, reject }); });
    }
    let nextId = 0;
    const server = {
      wait,
      async command(command) {
        const id = nextId++;
        child.send({ command, id });
        await wait(`ack-${id}`);
      },
      async close() {
        if (!children.delete(server)) return;
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
        timeout.unref();
        if (child.exitCode === null && child.signalCode === null) child.send({ command: 'close' });
        try {
          const [code, signal] = await exited;
          assert.equal(signal, null, 'Fixture must shut down gracefully');
          assert.equal(code, 0, stderr);
        } finally { clearTimeout(timeout); }
      },
    };
    children.add(server);
    const { port } = await wait('ready');
    assert.notEqual(port, 3000);
    server.request = (route, options = {}, user = 'fixture-a') => fetch(`http://127.0.0.1:${port}/api${route}`, {
      ...options, headers: { ...options.headers, Cookie: cookie(user) },
    });
    server.upload = (text, user) => {
      const body = new FormData();
      body.append('file', new Blob([text], { type: 'text/csv' }), 'synthetic.csv');
      return server.request('/import', { method: 'POST', body }, user);
    };
    server.backup = async (user) => {
      const response = await server.request('/backup', {}, user);
      assert.equal(response.status, 200);
      const { holdings, snapshots, dailyTotals, closedPositions } = await response.json();
      return { holdings, snapshots, dailyTotals, closedPositions };
    };
    return server;
  }
  return { start };
}

for (const [name, input] of [
  ['blank', (symbol, day) => csv('', symbol, day)],
  ['whitespace', (symbol, day) => csv('   ', symbol, day)],
  ['missing column', missingAccountCsv],
]) {
  test(`HTTP: repeated ${name} account imports remain idempotent through Rust and after restart`, { timeout: 15000 }, async t => {
    const env = await fixture(t);
    let server = await env.start();
    for (let repeat = 0; repeat < 2; repeat++) {
      assert.equal((await server.upload(input('SOLD', 20))).status, 200);
      assert.equal((await server.upload(input('TEST', 21))).status, 200);
    }
    await server.close();
    server = await env.start();
    for (let repeat = 0; repeat < 2; repeat++) assert.equal((await server.upload(input('TEST', 21))).status, 200);
    const data = await server.backup();
    assert.equal(data.holdings.length, 1);
    assert.equal(data.snapshots.length, 2);
    assert.equal(data.dailyTotals.length, 2);
    assert.equal(data.closedPositions.length, 2);
    assert.ok([...data.holdings, ...data.snapshots, ...data.closedPositions].every(row => row.account_name === null));
    assert.deepEqual(data.dailyTotals.map(row => row.spy_shares), [0.16, 0.16]);
  });

  test(`HTTP: duplicate ${name} account rows reject atomically in Rust`, { timeout: 10000 }, async t => {
    const env = await fixture(t);
    const server = await env.start();
    assert.equal((await server.upload(csv('Named'))).status, 200);
    const before = await server.backup();
    const lines = input('TEST', 21).split('\n');
    lines.splice(2, 0, lines[1], lines[1]);
    const response = await server.upload(lines.join('\n'));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Duplicate position/);
    assert.deepEqual(await server.backup(), before);
  });
}

test('HTTP: keep distinct users, named accounts and the literal name null separate', { timeout: 10000 }, async t => {
  const env = await fixture(t);
  const server = await env.start();
  const input = `${header}\nSYNTHETIC123,,TEST,2,10,20,8\nSYNTHETIC123,Named,TEST,3,10,30,8\nSYNTHETIC123,null,TEST,4,10,40,8\nDate downloaded Oct-21-2026`;
  for (const user of ['fixture-a', 'fixture-b']) {
    for (let repeat = 0; repeat < 2; repeat++) assert.equal((await server.upload(input, user)).status, 200);
  }
  const before = await server.backup('fixture-b');
  assert.equal((await server.upload(csv('', 'OTHER'), 'fixture-a')).status, 200);
  assert.deepEqual(await server.backup('fixture-b'), before);
  assert.equal(before.holdings.length, 3);
  assert.equal(before.snapshots.length, 3);
  assert.deepEqual(new Set(before.holdings.map(row => row.account_name)), new Set(['Named', 'null', null]));
  assert.ok(before.holdings.every(row => row.user_id === 'fixture-b'));
});

test('HTTP: stored empty and null accounts retain separate prices and sold-position identities', { timeout: 10000 }, async t => {
  const env = await fixture(t);
  const server = await env.start();
  const rows = [null, ''].map((account_name, i) => ({
    symbol: 'TEST', quantity: i + 1, cost_basis: 8, account_name,
    snapshot_date: '2026-10-20', current_price: 10 + i, current_value: (10 + i) * (i + 1),
  }));
  const body = new FormData();
  body.append('file', new Blob([JSON.stringify({ version: 1, holdings: rows, snapshots: rows, dailyTotals: [], closedPositions: [] })]), 'synthetic.json');
  assert.equal((await server.request('/restore', { method: 'POST', body })).status, 200);
  const response = await server.request('/holdings');
  const holdings = await response.json();
  assert.equal(holdings.find(row => row.accountName === null).currentPrice, 10);
  assert.equal(holdings.find(row => row.accountName === '').currentPrice, 11);
  assert.equal((await server.upload(csv(''))).status, 200);
  const data = await server.backup();
  assert.equal(data.closedPositions.length, 1);
  assert.equal(data.closedPositions[0].account_name, '');
  assert.equal(data.closedPositions[0].last_price, 11);
});

test('HTTP: concurrent and then serialized unnamed imports on independent app connections do not duplicate rows', { timeout: 15000 }, async t => {
  const env = await fixture(t);
  const first = await env.start();
  const second = await env.start();
  assert.equal((await first.upload(csv('', 'SOLD', 20))).status, 200);
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? first : second).upload(csv(''))));
  for (const response of responses) assert.equal(response.status, 200);
  assert.equal((await second.upload(csv(''))).status, 200);
  const data = await first.backup();
  assert.equal(data.holdings.length, 1);
  assert.equal(data.snapshots.length, 2);
  assert.equal(data.dailyTotals.length, 2);
  assert.equal(data.closedPositions.length, 1);
});

test('HTTP: read prior totals after an awaited quote so serialized commits use current benchmark state', { timeout: 15000 }, async t => {
  const env = await fixture(t);
  const first = await env.start();
  const second = await env.start();
  await first.command('holdQuotes');
  const pending = first.upload(csv('', 'TEST', 22, 1));
  await first.wait('quotePending');
  assert.equal((await second.upload(csv('', 'TEST', 21, 2))).status, 200);
  await first.command('releaseQuotes');
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).spyShares, 0.16);
  const data = await second.backup();
  assert.equal(data.dailyTotals[1].day_gain_loss, -10);
  assert.equal(data.dailyTotals[1].spy_shares, 0.16);
});
