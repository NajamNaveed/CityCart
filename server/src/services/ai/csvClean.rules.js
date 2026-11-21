const { parseCsv, toCsv } = require('../../utils/csv');
const {
  COLUMNS,
  REQUIRED_COLUMNS,
  IMPORT_STATUSES,
  MAX_IMPORT_ROWS,
  normalizeHeader,
  CsvImportError,
} = require('../productCsv.service');

/**
 * The text rules behind the CSV cleaner (docs/29 Phase 3b, part 2).
 *
 * Everything here is deterministic and explained in words the brand can check:
 * a currency symbol removed, a status spelled differently, a branch list
 * separated with commas. Nothing in this file decides money or stock — it only
 * rewrites a cell into the shape the ordinary importer already accepts, and the
 * importer stays the one that validates and writes.
 *
 * The model's share is the product name only, and even then its suggestion is
 * accepted by the agent after the catalogue itself confirms the name exists.
 */

const STATUS_WORDS = new Map(
  [
    ['ACTIVE', ['active', 'live', 'listed', 'selling', 'on', 'yes', 'true', '1']],
    ['DRAFT', ['draft', 'new', 'unpublished', 'editing']],
    ['INACTIVE', ['inactive', 'hidden', 'off', 'paused', 'stopped', 'no', 'false', '0']],
  ].flatMap(([status, words]) => words.map((word) => [word, status]))
);

/** "Rs 2,400" / "2400 PKR" / "2.4k" / "Rs 2,400/-" -> "2400". Only when the result is a plain number. */
function cleanPrice(raw) {
  const text = String(raw).trim();
  if (!text || /^\d+(\.\d{1,2})?$/.test(text)) return null;
  const withoutCurrency = text
    .replace(/^(rs\.?|rupees?|pkr|pk\s?re|₨)\s*/i, '')
    .replace(/\s*(rs\.?|rupees?|pkr|pk\s?re|₨)$/i, '')
    .replace(/\/-?\s*$/, '')
    .replace(/[\s,]/g, '');
  const thousands = /^(\d+(?:\.\d{1,3})?)\s*k$/i.exec(withoutCurrency);
  const value = thousands ? String(Number(thousands[1]) * 1000) : withoutCurrency;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return { value, reason: 'Prices are plain numbers — the currency and separators were removed.' };
}

/**
 * "20 units" / "5 pcs" -> "20" / "5". Only a word that is actually a unit:
 * "5abc" is not a quantity with a typo, it is a cell the shop has to read
 * itself, so it is left exactly as it is for the importer to refuse.
 */
const UNIT_WORDS = new Set([
  'unit', 'units', 'pc', 'pcs', 'piece', 'pieces', 'box', 'boxes', 'packet', 'packets',
  'pack', 'packs', 'dozen', 'kg', 'g', 'gm', 'l', 'ml', 'count', 'counts', 'nos', 'no',
]);

function cleanWhole(raw) {
  const text = String(raw).trim();
  const match = /^(\d+)\s*([a-z]+)$/i.exec(text);
  if (!match || !UNIT_WORDS.has(match[2].toLowerCase())) return null;
  return { value: match[1], reason: 'Stock counts are whole numbers — the unit word was removed.' };
}

function cleanStatus(raw) {
  const text = String(raw).trim();
  if (!text) return null;
  const status = STATUS_WORDS.get(text.toLowerCase());
  if (!status || status === text) return null;
  return { value: status, reason: `Statuses are written ${IMPORT_STATUSES.join(', ')} — "${text}" became ${status}.` };
}

/** "Gulberg, D Ground" -> "Gulberg|D Ground", only when the file uses no pipe yet. */
function cleanBranches(raw) {
  const text = String(raw).trim();
  if (!text || text.includes('|') || !/[,;]/.test(text)) return null;
  const value = text
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join('|');
  if (!value || value === text) return null;
  return { value, reason: 'Several branches are separated with a | sign.' };
}

function cleanName(raw) {
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text || text === raw) return null;
  return { value: text, reason: 'Extra spaces were removed from the name.' };
}

const CLEANERS = {
  name: cleanName,
  price: cleanPrice,
  compareAtPrice: cleanPrice,
  quantity: cleanWhole,
  lowStockThreshold: cleanWhole,
  status: cleanStatus,
  branches: cleanBranches,
};

/**
 * Every rule the column has, applied to one cell. Returns the new value and the
 * sentence that explains it, or null when the cell is already in shape.
 */
function cleanCell(column, raw) {
  const cleaner = CLEANERS[column];
  if (!cleaner) return null;
  return cleaner(raw) || null;
}

/** Header text as written in the file -> the column it means, or undefined. */
const COLUMN_LOOKUP = new Map(COLUMNS.map((column) => [normalizeHeader(column), column]));

/**
 * Read a file the way the importer reads it — same header mapping, same
 * required columns, same row limit — and return the rows with the text rules
 * already applied. `changes` is the diff the brand is shown before anything
 * is imported.
 */
function cleanText(text) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (err) {
    throw new CsvImportError(400, err.message);
  }
  if (rows.length === 0 || rows[0].every((header) => !String(header).trim())) {
    throw new CsvImportError(400, 'The file is empty.');
  }

  const header = rows[0];
  const columns = header.map((name) => COLUMN_LOOKUP.get(normalizeHeader(name)));
  const ignoredColumns = header.filter((name, index) => !columns[index] && String(name).trim());
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length) {
    throw new CsvImportError(400, `Missing required column(s): ${missing.join(', ')}.`);
  }

  // Cells are only padded to the header width, never truncated: a column the
  // importer does not know still belongs to the brand's file and is written back.
  const dataRows = rows
    .slice(1)
    .map((cells, index) => ({
      line: index + 2,
      cells: [...cells.map(String), ...Array(Math.max(0, header.length - cells.length)).fill('')],
    }))
    .filter((row) => row.cells.some((cell) => String(cell).trim() !== ''));
  if (dataRows.length === 0) {
    throw new CsvImportError(400, 'The file has no product rows.');
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new CsvImportError(400, `A file can have at most ${MAX_IMPORT_ROWS} products. Split it into smaller files.`);
  }

  // A row with more cells than the header has is not a messy row, it is a file
  // whose commas were never quoted: every column from that point is the wrong
  // one, so no rule — and no name suggestion — can be trusted on it. Say so
  // instead of guessing, and leave the row's cells exactly as the shop wrote them.
  dataRows.forEach((row) => {
    row.ragged = row.cells.length > header.length;
  });

  const changes = [];
  for (const row of dataRows) {
    if (row.ragged) continue;
    columns.forEach((column, index) => {
      if (!column) return;
      const raw = String(row.cells[index]);
      const cleaned = cleanCell(column, raw);
      if (!cleaned) return;
      row.cells[index] = cleaned.value;
      changes.push({ line: row.line, column, from: raw, to: cleaned.value, rule: cleaned.reason });
    });
  }

  const cellOf = (row, column) => {
    const index = columns.indexOf(column);
    return index === -1 ? '' : String(row.cells[index]).trim();
  };

  return {
    header,
    columns,
    ignoredColumns,
    dataRows,
    changes,
    ragged: dataRows.filter((row) => row.ragged).map((row) => row.line),
    cellOf,
    csv: () => toCsv([header, ...dataRows.map((row) => row.cells)]),
  };
}

module.exports = { cleanText, cleanCell, STATUS_WORDS };
