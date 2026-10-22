export class CsvImportError extends Error {}

function parseRecords(text) {
  const records = [];
  let fields = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += ch;
      }
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      fields.push(field.trim());
      field = '';
      closedQuote = false;
      if (ch !== ',') {
        records.push(fields);
        fields = [];
        if (ch === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (ch === '"' && !field.trim() && !closedQuote) {
      field = '';
      quoted = true;
    } else if ((closedQuote && ch.trim()) || ch === '"') {
      throw new CsvImportError('Invalid quoted field in CSV');
    } else {
      field += ch;
    }
  }
  if (quoted) throw new CsvImportError('Unterminated quoted field in CSV');
  if (field || fields.length) records.push([...fields, field.trim()]);
  return records;
}

function parseNumber(value, column, row, required = false) {
  let text = (value ?? '').trim();
  if (text === '' || text === '--' || /^n\/a$/i.test(text)) {
    if (required) throw new CsvImportError(`Missing ${column} in CSV row ${row}`);
    return null;
  }
  const accountingNegative = text.startsWith('(') && text.endsWith(')');
  if (accountingNegative) text = text.slice(1, -1);
  text = text.replace(/^\$([+-]?)/, '$1').replace(/^([+-])\$/, '$1');
  // Validate the entire field, including thousands grouping, before converting.
  const valid = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/;
  const number = Number(text.replaceAll(',', '')) * (accountingNegative ? -1 : 1);
  if (!valid.test(text) || !Number.isFinite(number) || (accountingNegative && /^[+-]/.test(text))) {
    throw new CsvImportError(`Invalid ${column} in CSV row ${row}`);
  }
  return number;
}

function parseSnapshotDate(text) {
  const match = [...text.matchAll(/Date downloaded\s+(\w{3})-(\d{2})-(\d{4})/gi)].at(-1);
  if (!match) return new Date().toISOString().split('T')[0];
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${match[2]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!month || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new CsvImportError('Invalid snapshot date in CSV footer');
  }
  return date;
}

export function parseFidelityCsv(csvText) {
  const records = parseRecords(csvText.replace(/^\uFEFF/, ''));
  const headers = (records.shift() ?? []).map(h => h.trim().toLowerCase());
  const index = name => headers.indexOf(name.toLowerCase());
  for (const name of ['Account Number', 'Symbol', 'Quantity', 'Current Value']) {
    if (index(name) === -1) throw new CsvImportError(`Missing required CSV column: ${name}`);
  }
  if (new Set(headers).size !== headers.length) throw new CsvImportError('Duplicate column in CSV header');
  const holdings = [];
  const positions = new Set();
  for (const [offset, fields] of records.entries()) {
    const cell = name => fields[index(name)] ?? '';
    const rawSymbol = cell('Symbol');
    // Fidelity disclaimers and blank records have no symbol/account columns.
    if (!rawSymbol || rawSymbol.startsWith('**') || rawSymbol.toLowerCase() === 'symbol') continue;
    const row = offset + 2;
    if (fields.length !== headers.length) throw new CsvImportError(`Unexpected column count in CSV row ${row}`);
    if (!/^[A-Za-z0-9-]+$/.test(cell('Account Number'))) {
      throw new CsvImportError(`Invalid Account Number in CSV row ${row}`);
    }
    const symbol = rawSymbol.replace(/\*+$/, '');
    let quantity = parseNumber(cell('Quantity'), 'Quantity', row);
    const currentValue = parseNumber(cell('Current Value'), 'Current Value', row, true);
    let currentPrice = parseNumber(cell('Last Price'), 'Last Price', row);
    let costBasis = parseNumber(cell('Average Cost Basis'), 'Average Cost Basis', row);
    const lastPriceChange = parseNumber(cell('Last Price Change'), 'Last Price Change', row) ?? 0;

    // Cash positions may omit both quantity and price. Do not infer an equity's
    // cost basis merely because it happens to have a quantity of one.
    const cashQuantity = quantity == null || quantity === 0 || rawSymbol.endsWith('**');
    if (cashQuantity && currentPrice == null && currentValue > 0) {
      quantity = 1;
      currentPrice = currentValue;
      costBasis = currentValue;
    } else if (quantity == null || quantity === 0) {
      throw new CsvImportError(`Missing or zero Quantity in CSV row ${row}`);
    }

    const accountName = cell('Account Name') || null;
    const key = JSON.stringify([symbol, accountName]);
    if (positions.has(key)) throw new CsvImportError(`Duplicate position in CSV row ${row}`);
    positions.add(key);
    holdings.push({
      symbol,
      description: cell('Description') || null,
      quantity,
      costBasis,
      currentPrice,
      lastPriceChange,
      currentValue,
      accountName,
    });
  }
  return { holdings, snapshotDate: parseSnapshotDate(csvText) };
}
