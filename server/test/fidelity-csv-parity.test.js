import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CsvImportError, parseFidelityCsv } from '../fidelity-csv.js';
import { parseReferenceCsv } from '../test-support/fidelity-csv-reference.js';

// Synthetic differential corpus against the prerequisite parser, including its
// deliberately retained edge cases. The reference is never used by the app.
const header = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Average Cost Basis';
const row = ['X-123', 'Fixture Account', 'TEST', 'Synthetic position', '2.5', '$10', '-$0.25', '$25', '$8'];
const escape = value => `"${String(value).replaceAll('"', '""')}"`;
const record = cells => cells.map(escape).join(',');
const csv = (cells = row, footer = 'Date downloaded Oct-21-2026') => `${header}\r\n${record(cells)}\r\n${footer}`;
const cases = [];
function add(name, input) { cases.push([name, input]); }

for (const [name, input] of [
  ['empty', ''], ['blank', '\n\r\n'], ['headers only', header],
  ['BOM', `\uFEFF${csv()}`], ['repeated BOM whitespace', `\uFEFF\uFEFF${csv()}`],
  ['lowercase headers', csv().replace(header, header.toLowerCase())],
  ['header whitespace', csv().replace(header, header.split(',').map(h => ` ${h.toUpperCase()} `).join(','))],
  ['reordered columns', `Current Value,Quantity,Symbol,Account Number\n25,2.5,TEST,A`],
  ['optional columns absent', 'Account Number,Symbol,Quantity,Current Value\nA,TEST,.5,5'],
  ['duplicate header', `${header},QUANTITY\n${record([...row, '1'])}`],
  ['duplicate empty header', `${header},,\n${record([...row, '', ''])}`],
  ['missing required precedes duplicate', 'Symbol,Symbol\nTEST,TEST'],
  ['duplicate position', `${csv(row, '')}${record(row)}`],
  ['duplicate after trimming stars', `${csv(row, '')}${record(row.map((v, i) => i === 2 ? 'TEST*' : v))}`],
  ['same symbol other account number', `${csv(row, '')}${record(row.map((v, i) => i === 0 ? 'OTHER' : v))}`],
  ['same symbol other account name', `${csv(row, '')}${record(row.map((v, i) => i === 1 ? 'Other Fixture' : v))}`],
  ['truncated position', `${header}\nX,A,TEST,Example,1`],
  ['extra cell', `${header}\n${record([...row, 'extra'])}`],
  ['blank symbol skips truncated row', `${header}\nX,A,`],
  ['symbol label skips truncated row', `${header}\nX,A,SYMBOL`],
  ['symbol footnote skips truncated row', `${header}\nX,A,**note`],
  ['unterminated quote before header validation', 'Symbol\n"oops'],
  ['quote in unquoted cell', `${header}\nX,A,TE"ST,Example,1,1,1,1,1`],
  ['text after closing quote', `${header}\n"X"oops,A,TEST,Example,1,1,1,1,1`],
  ['space after closing quote', `${header}\n"X"  ,A,TEST,Example,1,1,1,1,1`],
  ['quote after closed quote whitespace', `${header}\n"X" "",A,TEST,Example,1,1,1,1,1`],
  ['leading space before opening quote', `${header}\n \t"X",A,TEST,Example,1,1,1,1,1`],
]) add(name, input);

for (const delimiter of ['\n', '\r', '\r\n']) {
  add(`record delimiter ${JSON.stringify(delimiter)}`, csv().replaceAll('\r\n', delimiter));
}
for (const account of ['', 'A-123', '1', '-', 'bad account', 'A_123', 'Ａ123', 'A/123', 'é123']) {
  add(`account ${JSON.stringify(account)}`, csv(row.map((v, i) => i === 0 ? account : v)));
}
for (const footer of [
  '', 'Date downloaded Feb-29-2024', 'DATE DOWNLOADED\tJan-01-0000',
  'Date downloaded Feb-29-1900', 'Date downloaded Feb-29-2000',
  'Date downloaded Apr-31-2026', 'Date downloaded Jan-00-2026',
  'Date downloaded Xxx-01-2026', 'Date downloaded Oct-21-20260',
  'Date downloaded Jan-01-2020\nDate downloaded Oct-21-2026',
  'Date downloaded Feb-31-2026\nDate downloaded Jan-01-2024',
  'Date downloaded Jan-01-2024\nDate downloaded Feb-31-2026',
  'Date downloaded\uFEFFOct-21-2026', 'Date downloaded\u0085Oct-21-2026',
  'Date downloaded Oct-1-2026', 'Date downloaded January-01-2026',
  'The data and information, synthetic, more',
  'This synthetic export is informational, values change, more',
  '** note, synthetic, more',
  'This synthetic exporter is informational, values change, more',
  'This export\nis informational, values change, more',
]) add(`footer ${JSON.stringify(footer)}`, csv(row, footer));

for (const field of [4, 5, 6, 7, 8]) {
  for (const number of [
    '', '--', 'n/A', '0', '-0', '1', '+1', '-1', '.5', '-.5', '1.',
    '0001', '1,234.50', '12,345,678.9', '$1,234', '+$8', '-$8', '$+8', '$-8', '$+$8',
    '($1,234.5)', '(+1)', '(-1)', '( 1)', '$ 1', '1,23', '1234,567', '1,,234',
    '1e2', '1e309', 'Infinity', 'NaN', '1%', '12oops', '−1', '１', '\uFEFF1\u00a0', '\u00851',
    '0.' + '0'.repeat(323) + '5', '9'.repeat(309),
  ]) add(`numeric column ${field} ${JSON.stringify(number)}`, csv(row.map((v, i) => i === field ? number : v)));
}
for (const symbol of ['SPAXX**', 'TEST*', '*', '**', 'symbol', 'SyMbOl', 'TEST:CLASS', 'ΔTEST', '']) {
  for (const quantity of ['', '0', '1']) {
    add(`cash/symbol ${symbol} quantity ${quantity}`, csv(row.map((v, i) => ({ 2: symbol, 4: quantity, 5: '--', 8: '--' })[i] ?? v)));
  }
}
for (const disclaimer of ['The data and information, more, more', 'This export is informational, more, more', '** footnote, more, more']) {
  for (const badRow of ['X,A,OTHER,Example,1', 'bad account,A,OTHER,Example,1,1,0,1,1', 'X,A,OTHER,Example,12oops,1,0,1,1']) {
    add(`validation after footer ${disclaimer} ${badRow}`, csv(row, `${disclaimer}\n${badRow}\nDate downloaded Oct-21-2026`));
  }
}

// A seeded string corpus checks escaping, Unicode and embedded record delimiters
// without storing or reading any real export. Stable seed makes failures replayable.
let seed = 0x6f726163;
const alphabet = ['a', ',', '"', '\n', '\r', '\t', '\uFEFF', '\u00a0', '\u0085', 'λ', '😀', '\0', '\u2028', '\\'];
for (let i = 0; i < 64; i++) {
  let description = '';
  for (let j = 0; j < 24; j++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    description += alphabet[seed % alphabet.length];
  }
  add(`seeded description ${i}`, csv(row.map((v, column) => column === 3 ? description : v)));
}

for (const [name, input] of cases) {
  test(`Rust parity: ${name}`, async () => {
    let expected;
    try {
      expected = parseReferenceCsv(input);
    } catch (error) {
      await assert.rejects(() => parseFidelityCsv(input), actual => {
        assert.ok(actual instanceof CsvImportError);
        assert.equal(actual.message, error.message);
        return true;
      });
      return;
    }
    const actual = await parseFidelityCsv(input);
    // Permit a UTC midnight rollover only for exports with no recognized date.
    const after = parseReferenceCsv(input);
    assert.ok([expected.snapshotDate, after.snapshotDate].includes(actual.snapshotDate));
    assert.deepEqual(actual.holdings, expected.holdings);
  });
}

test('parse a whole synthetic batch with thousands of positions in one call', async () => {
  const rows = Array.from({ length: 3000 }, (_, i) => record(row.map((v, column) => column === 2 ? `TEST${i}` : v)));
  const input = `${header}\n${rows.join('\n')}\nDate downloaded Oct-21-2026`;
  assert.deepEqual(await parseFidelityCsv(input), parseReferenceCsv(input));
});
