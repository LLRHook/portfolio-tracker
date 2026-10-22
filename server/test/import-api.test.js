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
process.env.DATABASE_PATH = ':memory:';
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

for (const [name, invalidCsv, expectedError] of [
  ['malformed quantity', fixtureCsv.replace(',2,', ',12oops,'), /Quantity.*row 2/],
  ['malformed value', fixtureCsv.replace('$20.00', 'Infinity'), /Current Value.*row 2/],
  ['duplicate positions', `${headers}\n${fixtureRow}\n${fixtureRow}`, /Duplicate position/],
  ['missing required columns', 'Symbol,Quantity\nTEST,2', /column/],
  ['empty file', '', /column/],
  ['header without holdings', headers, /No valid holdings/],
  ['invalid snapshot date', fixtureCsv.replace('Oct-21-2026', 'Feb-31-2026'), /date/],
  ['numeric overflow', fixtureCsv.replace(',2,', `,1${'0'.repeat(308)},`), /numeric range/],
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
