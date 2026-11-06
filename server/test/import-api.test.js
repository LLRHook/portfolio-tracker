import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, afterEach, before, mock, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-api-'));
const envPath = path.join(directory, 'empty.env');
writeFileSync(envPath, '');
// Never load the developer's .env or portfolio database.
process.env.DOTENV_CONFIG_PATH = envPath;
process.env.DATABASE_PATH = path.join(directory, 'fixture.db');
process.env.ENCRYPTION_KEY = '12'.repeat(32);
process.env.SESSION_SECRET = 'synthetic-import-api-secret';
const { app } = await import('../server.js');
const { db } = await import('../db.js');
const httpFetch = globalThis.fetch;
let server;
let baseUrl;
let quoteRequests = 0;

before(async () => {
  mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'query2.finance.yahoo.com', 'Unexpected outbound network request');
    quoteRequests++;
    return Response.json({ chart: { result: [{
      timestamp: [Date.parse('2026-10-21T20:00:00Z') / 1000],
      indicators: { quote: [{ close: [100] }] },
    }] } });
  });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

afterEach(() => {
  db.exec('DELETE FROM holdings; DELETE FROM snapshots; DELETE FROM daily_totals; DELETE FROM closed_positions');
  quoteRequests = 0;
});

after(async () => {
  mock.restoreAll();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

const headers = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Average Cost Basis';
const fixtureRow = '123456789,Fixture Account,TEST,Example Company,2,$10.00,-$1.00,$20.00,$8.00';
const fixtureCsv = `${headers}\n${fixtureRow}\n\nDate downloaded Oct-21-2026`;
const disclaimer = 'This synthetic export is informational, values may change, consult your statements.';

async function upload(text) {
  const body = new FormData();
  body.append('file', new Blob([text], { type: 'text/csv' }), 'fixture.csv');
  return httpFetch(`${baseUrl}/import`, { method: 'POST', body });
}

async function backupData() {
  const response = await httpFetch(`${baseUrl}/backup`);
  assert.equal(response.status, 200);
  const { holdings, snapshots, dailyTotals, closedPositions } = await response.json();
  return { holdings, snapshots, dailyTotals, closedPositions };
}

test('import synthetic data through HTTP and expose consistent holdings and history', async () => {
  const response = await upload(fixtureCsv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { imported: 1, snapshotDate: '2026-10-21', spyShares: 0.16 });
  const holdings = await (await httpFetch(`${baseUrl}/holdings`)).json();
  assert.equal(holdings[0].quantity, 2);
  assert.equal(holdings[0].currentValue, 20);
  assert.equal(holdings[0].gainLoss, 4);
  const history = await (await httpFetch(`${baseUrl}/history?range=all`)).json();
  assert.equal(history.portfolio[0].totalValue, 20);
  assert.equal(history.portfolio[0].totalCost, 16);
  assert.equal(history.benchmark[0].spValue, 16);
});

test('import comma-containing disclaimer footers without changing portfolio results', async () => {
  const response = await upload(fixtureCsv.replace('Date downloaded', `${disclaimer}\nDate downloaded`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { imported: 1, snapshotDate: '2026-10-21', spyShares: 0.16 });
  const data = await backupData();
  assert.equal(data.holdings.length, 1);
  assert.equal(data.holdings[0].symbol, 'TEST');
  assert.equal(data.snapshots.length, 1);
  assert.equal(data.dailyTotals.length, 1);
  assert.equal(data.closedPositions.length, 0);
});

for (const [name, invalidCsv, expectedError] of [
  ['malformed quantity', fixtureCsv.replace(',2,', ',12oops,'), /Quantity.*row 2/],
  ['malformed value', fixtureCsv.replace('$20.00', 'Infinity'), /Current Value.*row 2/],
  ['duplicate positions', `${headers}\n${fixtureRow}\n${fixtureRow}`, /Duplicate position/],
  ['missing required columns', 'Symbol,Quantity\nTEST,2', /column/],
  ['empty file', '', /column/],
  ['header without holdings', headers, /No valid holdings/],
  ['invalid snapshot date', fixtureCsv.replace('Oct-21-2026', 'Feb-31-2026'), /date/],
  ['numeric overflow', fixtureCsv.replace(',2,', `,1${'0'.repeat(308)},`), /numeric range/],
  ['malformed position before disclaimer', fixtureCsv.replace('Date downloaded', `123456789,Fixture Account,OTHER,Example,2\n${disclaimer}\nDate downloaded`), /column count.*row/],
  ['malformed position after disclaimer', fixtureCsv.replace('Date downloaded', `${disclaimer}\n123456789,Fixture Account,OTHER,Example,2oops,10,0,20,8\nDate downloaded`), /Quantity.*row/],
  ['invalid account before disclaimer', fixtureCsv.replace('Date downloaded', `invalid account,Fixture Account,OTHER,Example,2,10,0,20,8\n${disclaimer}\nDate downloaded`), /Account Number.*row/],
]) {
  test(`reject ${name} with a 400 and preserve all existing portfolio data`, async () => {
    assert.equal((await upload(fixtureCsv.replace(',TEST,', ',SOLD,').replace('Oct-21-2026', 'Oct-20-2026'))).status, 200);
    assert.equal((await upload(fixtureCsv)).status, 200);
    const before = await backupData();
    assert.equal(before.closedPositions.length, 1);
    assert.equal(before.snapshots.length, 2);
    const requestsBefore = quoteRequests;
    const response = await upload(invalidCsv);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, expectedError);
    assert.deepEqual(await backupData(), before);
    assert.equal(quoteRequests, requestsBefore, 'Validate before requesting benchmark prices');
  });
}

test('preserve zero-valued positions and report their full loss', async () => {
  const response = await upload(fixtureCsv.replace('$10.00', '$0.00').replace('$20.00', '$0.00'));
  assert.equal(response.status, 200);
  const [holding] = await (await httpFetch(`${baseUrl}/holdings`)).json();
  assert.equal(holding.currentPrice, 0);
  assert.equal(holding.currentValue, 0);
  assert.equal(holding.gainLoss, -16);
  assert.equal(holding.gainLossPercent, -100);
});

test('keep unreported equity cost basis unknown through the API', async () => {
  const response = await upload(fixtureCsv.replace(',2,', ',1,').replace('$8.00', '--'));
  assert.equal(response.status, 200);
  const [holding] = await (await httpFetch(`${baseUrl}/holdings`)).json();
  assert.equal(holding.costBasis, null);
  assert.equal(holding.gainLoss, null);
});

test('reimport the same dated CSV without duplicating snapshots, totals or sold positions', async () => {
  assert.equal((await upload(fixtureCsv.replace(',TEST,', ',SOLD,').replace('Oct-21-2026', 'Oct-20-2026'))).status, 200);
  const first = await upload(fixtureCsv);
  assert.equal(first.status, 200);
  const result = await first.json();
  const before = await backupData();
  const repeat = await upload(fixtureCsv);
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), result);
  const after = await backupData();
  // imported_at is an intentional refresh timestamp, not imported portfolio data.
  const withoutImportTime = data => ({ ...data, holdings: data.holdings.map(({ imported_at, ...holding }) => holding) });
  assert.deepEqual(withoutImportTime(after), withoutImportTime(before));
  assert.equal(after.holdings.length, 1);
  assert.equal(after.snapshots.length, 2);
  assert.equal(after.dailyTotals.length, 2);
  assert.equal(after.closedPositions.length, 1);
});

for (const [account, inputCsv] of [['named', fixtureCsv], ['unnamed', fixtureCsv.replace('Fixture Account', '')]]) {
  test(`roll back every ${account} import write if SQLite fails after a valid Rust result`, async () => {
    assert.equal((await upload(inputCsv.replace(',TEST,', ',SOLD,').replace('Oct-21-2026', 'Oct-20-2026'))).status, 200);
    const before = await backupData();
    db.exec(`CREATE TEMP TRIGGER fail_synthetic_snapshot BEFORE INSERT ON snapshots
      WHEN NEW.symbol = 'FAIL' BEGIN SELECT RAISE(ABORT, 'Synthetic snapshot failure'); END`);
    try {
      const row = inputCsv.split('\n')[1];
      const input = `${headers}\n${row}\n${row.replace(',TEST,', ',FAIL,')}\nDate downloaded Oct-21-2026`;
      const response = await upload(input);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Failed to import CSV' });
      // Includes an attempted closed position, deleted holdings, a first new
      // holding/snapshot and the failed second row: none may survive the rollback.
      assert.deepEqual(await backupData(), before);
    } finally {
      db.exec('DROP TRIGGER fail_synthetic_snapshot');
    }
  });
}

for (const table of ['holdings', 'snapshots', 'closed_positions']) {
  test(`reject ambiguous legacy unnamed ${table} without changing the portfolio`, async () => {
    const unnamed = fixtureCsv.replace('Fixture Account', '');
    assert.equal((await upload(unnamed.replace(',TEST,', ',SOLD,').replace('Oct-21-2026', 'Oct-20-2026'))).status, 200);
    if (table === 'holdings') {
      db.exec("INSERT INTO holdings (user_id, symbol, quantity) VALUES ('admin', 'SOLD', 9)");
    } else if (table === 'snapshots') {
      db.exec(`INSERT INTO snapshots (user_id, snapshot_date, symbol, quantity)
        VALUES ('admin', '2026-10-21', 'TEST', 1), ('admin', '2026-10-21', 'TEST', 9)`);
    } else {
      db.exec(`INSERT INTO closed_positions (user_id, close_date, symbol, quantity)
        VALUES ('admin', '2026-10-21', 'SOLD', 1), ('admin', '2026-10-21', 'SOLD', 9)`);
    }
    const before = await backupData();
    const response = await upload(unnamed);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Failed to import CSV' });
    assert.deepEqual(await backupData(), before);
  });
}

test('native processor failure returns the existing 500 schema before quotes or DB writes', async () => {
  assert.equal((await upload(fixtureCsv)).status, 200);
  const before = await backupData();
  const requestsBefore = quoteRequests;
  const previous = process.env.FIDELITY_CSV_BIN;
  process.env.FIDELITY_CSV_BIN = path.join(directory, 'missing-processor');
  try {
    const response = await upload(fixtureCsv.replace(',TEST,', ',OTHER,'));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Failed to import CSV' });
    assert.deepEqual(await backupData(), before);
    assert.equal(quoteRequests, requestsBefore);
  } finally {
    if (previous === undefined) delete process.env.FIDELITY_CSV_BIN;
    else process.env.FIDELITY_CSV_BIN = previous;
  }
});

test('preserve the no-file 400 error schema', async () => {
  const response = await httpFetch(`${baseUrl}/import`, { method: 'POST', body: new FormData() });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'No file uploaded' });
  assert.equal(quoteRequests, 0);
});
