/**
 * Minimal CSV reader/writer (RFC 4180 style) — no dependency needed for the
 * product import/export. Handles quoted cells, doubled quotes, commas and
 * newlines inside quotes, CRLF/LF/CR line ends and a leading BOM (Excel).
 */

// Returns an array of rows, each an array of string cells.
function parseCsv(text) {
  const input = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (inQuotes) {
    throw new Error('The file has an unclosed quote.');
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Spreadsheets run text that starts with these characters as a formula, so a
// product named `=HYPERLINK(...)` would execute when the export is opened.
// Prefixing an apostrophe makes the cell plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

function formatCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(formatCell).join(',')).join('\r\n');
}

module.exports = { parseCsv, toCsv };
