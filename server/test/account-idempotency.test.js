import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, afterEach, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'portfolio-accounts-'));
const databasePath = path.join(directory, 'fixture.db');
process.env.DATABASE_PATH = databasePath;
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'empty.env');
process.env.ENCRYPTION_KEY = '12'.repeat(32);
process.env.SESSION_SECRET = 'synthetic-account-test-secret';
writeFileSync(process.env.DOTENV_CONFIG_PATH, '');
const {
  db, upsertHolding, getHoldings, insertSnapshot, getAllSnapshots,
  insertClosedPosition, getClosedPositions, restoreUserData,
} = await import('../db.js');

afterEach(() => {
  db.exec('DELETE FROM holdings; DELETE FROM snapshots; DELETE FROM closed_positions; DELETE FROM daily_totals');
});
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

const holding = { symbol: 'TEST', quantity: 2, costBasis: 8, currentPrice: 10, currentValue: 20 };
const entities = [
  {
    table: 'holdings', read: getHoldings,
    write: (user, account, quantity = 2, date = '2026-10-21', symbol = 'TEST') =>
      upsertHolding(user, { ...holding, symbol, quantity, accountName: account }),
  },
  {
    table: 'snapshots', read: getAllSnapshots,
    write: (user, account, quantity = 2, date = '2026-10-21', symbol = 'TEST') =>
      insertSnapshot(user, date, { ...holding, symbol, quantity, accountName: account }),
  },
  {
    table: 'closed_positions', read: getClosedPositions,
    write: (user, account, quantity = 2, date = '2026-10-21', symbol = 'TEST') =>
      insertClosedPosition(user, { symbol, quantity, close_date: date, account_name: account, cost_basis: 8, last_price: 10 }),
  },
];

for (const entity of entities) {
  test(`${entity.table}: missing and null accounts update one row without conflating empty or named accounts`, () => {
    for (const account of [undefined, null, '', 'Named', 'Other', 'null']) {
      entity.write('fixture-a', account);
    }
    const first = entity.read('fixture-a');
    assert.equal(first.length, 5);
    const id = first.find(row => row.account_name === null).id;
    for (let repeat = 0; repeat < 4; repeat++) {
      entity.write('fixture-a', undefined, 7);
      entity.write('fixture-a', null, 7);
    }
    const rows = entity.read('fixture-a');
    assert.equal(rows.length, 5);
    assert.equal(rows.find(row => row.account_name === null).id, id);
    assert.equal(rows.find(row => row.account_name === null).quantity, 7);
    assert.ok(rows.filter(row => row.account_name !== null).every(row => row.quantity === 2));
    entity.write('fixture-b', null, 3);
    entity.write('fixture-a', null, 4, '2026-10-21', 'OTHER');
    assert.equal(entity.read('fixture-b').length, 1);
    assert.equal(entity.read('fixture-a').length, 6);
  });

  if (entity.table !== 'holdings') {
    test(`${entity.table}: unnamed positions on different dates remain distinct`, () => {
      for (const date of ['2026-10-20', '2026-10-21']) {
        entity.write('fixture-a', null, 2, date);
        entity.write('fixture-a', undefined, 3, date);
      }
      assert.equal(entity.read('fixture-a').length, 2);
      assert.ok(entity.read('fixture-a').every(row => row.quantity === 3));
    });
  }

  test(`${entity.table}: ambiguous legacy unnamed rows are preserved and reject updates`, () => {
    // Bypass the app writer only to represent an old database's ambiguous rows.
    const date = entity.table === 'snapshots' ? ", snapshot_date" : entity.table === 'closed_positions' ? ', close_date' : '';
    const dateValue = date ? ", '2026-10-21'" : '';
    db.exec(`INSERT INTO ${entity.table} (user_id, symbol, quantity, account_name${date})
      VALUES ('fixture-a', 'TEST', 1, NULL${dateValue}), ('fixture-a', 'TEST', 9, NULL${dateValue})`);
    const before = entity.read('fixture-a');
    assert.throws(() => entity.write('fixture-a', null), /ambiguous.*unnamed account/i);
    assert.deepEqual(entity.read('fixture-a'), before);
    // Unrelated identities remain writable; initialization is not blocked.
    entity.write('fixture-a', 'Named');
    entity.write('fixture-b', null);
  });
}

test('roll back nested unnamed upserts with the surrounding transaction', () => {
  const transaction = db.transaction(() => {
    upsertHolding('fixture-a', holding);
    upsertHolding('fixture-a', { ...holding, accountName: null, quantity: 9 });
    insertSnapshot('fixture-a', '2026-10-21', holding);
    throw new Error('Synthetic rollback');
  });
  assert.throws(() => transaction.immediate(), /Synthetic rollback/);
  assert.deepEqual(getHoldings('fixture-a'), []);
  assert.deepEqual(getAllSnapshots('fixture-a'), []);
});

for (const table of ['holdings', 'snapshots', 'closed_positions']) {
  test(`restore rejects ambiguous unnamed ${table} without replacing existing records`, () => {
    upsertHolding('fixture-a', { ...holding, accountName: 'Existing' });
    const row = { symbol: 'TEST', quantity: 2, snapshot_date: '2026-10-21', close_date: '2026-10-21' };
    const backup = { holdings: [], snapshots: [], closed_positions: [] };
    backup[table] = [row, { ...row, account_name: null, quantity: 9 }];
    const before = getHoldings('fixture-a');
    assert.throws(() => restoreUserData('fixture-a', backup.holdings, backup.snapshots, [], backup.closed_positions), /ambiguous.*unnamed account/i);
    assert.deepEqual(getHoldings('fixture-a'), before);
    assert.deepEqual(getAllSnapshots('fixture-a'), []);
    assert.deepEqual(getClosedPositions('fixture-a'), []);
  });
}

function writerProcess(repeats) {
  const source = `
    import { db, upsertHolding, insertSnapshot, insertClosedPosition } from './db.js';
    for (let i = 0; i < ${repeats}; i++) {
      upsertHolding('restart-fixture', { symbol: 'TEST', quantity: 2 });
      insertSnapshot('restart-fixture', '2026-10-21', { symbol: 'TEST', quantity: 2 });
      insertClosedPosition('restart-fixture', { symbol: 'SOLD', quantity: 2, close_date: '2026-10-21' });
    }
    db.close();
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, DATABASE_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
  });
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Synthetic writer exited ${code}: ${stderr}`)));
  });
}

test('persist unnamed idempotency across database restarts and concurrent writer connections', async () => {
  await writerProcess(2);
  await writerProcess(2);
  await Promise.all([writerProcess(20), writerProcess(20)]);
  assert.equal(getHoldings('restart-fixture').length, 1);
  assert.equal(getAllSnapshots('restart-fixture').length, 1);
  assert.equal(getClosedPositions('restart-fixture').length, 1);
});
