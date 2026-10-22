import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFidelityCsv } from '../fidelity-csv.js';

// Synthetic data in the Fidelity positions export format; no account data.
const headers = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Average Cost Basis';
function csv(overrides = {}) {
  const row = {
    account: '123456789', name: 'Fixture Account', symbol: 'TEST',
    description: 'Example Company', quantity: '12.5', price: '$10.00',
    change: '-$0.25', value: '$125.00', cost: '$8.00', ...overrides,
  };
  const escape = value => `"${String(value).replaceAll('"', '""')}"`;
  return `${headers}\r\n${Object.values(row).map(escape).join(',')}\r\n\r\nDate downloaded Oct-21-2026`;
}

test('parse a synthetic export with quoted currency, fractions, and a dated footer', () => {
  const parsed = parseFidelityCsv(csv({ quantity: '123.5', value: '$1,235.00' }));
  assert.equal(parsed.snapshotDate, '2026-10-21');
  assert.equal(parsed.holdings.length, 1);
  assert.equal(parsed.holdings[0].quantity, 123.5);
  assert.equal(parsed.holdings[0].currentValue, 1235);
  assert.equal(parsed.holdings[0].lastPriceChange, -0.25);
});

test('preserve positions when comma-containing disclaimer records follow the table', () => {
  for (const disclaimer of [
    'This synthetic export is informational, values may change, consult your statements.',
    'The data and information in this spreadsheet is provided solely for your use, may change, and is informational.',
    '** Pricing information is indicative, may be delayed, and is subject to change.',
  ]) {
    const input = csv().replace('Date downloaded', `${disclaimer}\r\nDate downloaded`);
    assert.deepEqual(parseFidelityCsv(input), parseFidelityCsv(csv()));
  }
});

test('keep validating real position rows before and after disclaimer records', () => {
  const disclaimer = 'This synthetic export is informational, values may change, consult your statements.';
  for (const malformed of [
    '123456789,Fixture Account,OTHER,Example,2',
    'invalid account,Fixture Account,OTHER,Example,2,10,0,20,8',
    '123456789,Fixture Account,OTHER,Example,2oops,10,0,20,8',
  ]) {
    for (const records of [`${malformed}\n\n${disclaimer}`, `${disclaimer}\n${malformed}`]) {
      assert.throws(() => parseFidelityCsv(csv().replace('Date downloaded', `${records}\nDate downloaded`)), /row \d+/i);
    }
  }
});

for (const [field, value] of [
  ['quantity', '12oops'], ['quantity', 'Infinity'], ['quantity', '1e309'],
  ['quantity', ''], ['value', '125oops'], ['value', 'Infinity'],
  ['price', '$10oops'], ['cost', '$8oops'], ['change', '$0oops'],
  ['quantity', '0'], ['value', ''], ['value', '$1,23.00'],
]) {
  test(`reject malformed ${field} ${JSON.stringify(value)} instead of replacing holdings`, () => {
    assert.throws(() => parseFidelityCsv(csv({ [field]: value })), /row 2/i);
  });
}

test('preserve missing cost basis for a single share of an equity', () => {
  const { holdings } = parseFidelityCsv(csv({ quantity: '1', cost: '--' }));
  assert.equal(holdings[0].costBasis, null);
});

test('import a core money market position with no quantity or quote', () => {
  const { holdings } = parseFidelityCsv(csv({ symbol: 'SPAXX**', quantity: '', price: '--', cost: '--', value: '$1,234.56' }));
  assert.equal(holdings[0].symbol, 'SPAXX');
  assert.equal(holdings[0].quantity, 1);
  assert.equal(holdings[0].costBasis, 1234.56);
  assert.equal(holdings[0].currentPrice, 1234.56);
});

test('import a marked core position with quantity one and no quote', () => {
  const { holdings } = parseFidelityCsv(csv({ symbol: 'SPAXX**', quantity: '1', price: '--', cost: '--' }));
  assert.equal(holdings[0].costBasis, 125);
  assert.equal(holdings[0].currentPrice, 125);
});

test('parse accounting negatives and signed currency without truncation', () => {
  const { holdings } = parseFidelityCsv(csv({ change: '($1,234.56)', cost: '+$8.00' }));
  assert.equal(holdings[0].lastPriceChange, -1234.56);
  assert.equal(holdings[0].costBasis, 8);
});

test('accept alphanumeric brokerage account identifiers', () => {
  const { holdings } = parseFidelityCsv(csv({ account: 'X12345678' }));
  assert.equal(holdings.length, 1);
});

test('preserve escaped quotes and embedded newlines in descriptions', () => {
  const description = 'Example "Class A", Inc.\nCommon stock';
  const { holdings } = parseFidelityCsv(csv({ description }));
  assert.equal(holdings[0].description, description);
});

test('reject missing required columns and unterminated quoted records', () => {
  assert.throws(() => parseFidelityCsv('Symbol,Quantity\nTEST,1'), /column/i);
  assert.throws(() => parseFidelityCsv(`${headers}\n"123,Fixture,TEST`), /quot/i);
});

test('reject impossible snapshot dates', () => {
  assert.throws(() => parseFidelityCsv(csv().replace('Oct-21-2026', 'Feb-31-2026')), /date/i);
});

test('use the last dated footer rather than a date mentioned in a description', () => {
  const parsed = parseFidelityCsv(csv({ description: 'Date downloaded Jan-01-2020' }));
  assert.equal(parsed.snapshotDate, '2026-10-21');
});

test('reject ambiguous headers and truncated position rows', () => {
  assert.throws(() => parseFidelityCsv(`${headers},Quantity\n123,A,TEST,Example,1,1,0,1,1,2`), /Duplicate column/);
  assert.throws(() => parseFidelityCsv(`${headers}\n123,A,TEST,Example,1`), /column count.*row 2/i);
});

test('accept a BOM and missing optional columns', () => {
  const { holdings } = parseFidelityCsv('\uFEFFAccount Number,Symbol,Quantity,Current Value\n123,TEST,0.5,5');
  assert.equal(holdings[0].costBasis, null);
  assert.equal(holdings[0].currentPrice, null);
  assert.equal(holdings[0].currentValue, 5);
});
