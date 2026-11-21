const { z } = require('zod');

const CatalogProduct = require('../../../models/catalogProduct.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { slugify } = require('../../../utils/slugify');
const { cleanText } = require('../csvClean.rules');
const {
  CSV_CLEAN_SYSTEM,
  buildCsvCleanInput,
  ROWS_PER_CALL,
  MAX_ROWS_ASKED,
  NAME_LIMIT,
} = require('../prompts/csvClean.prompt');

/**
 * The CSV cleaner (docs/29 Phase 3b, part 2).
 *
 * Preview only. Every cell this changes is a text rule the brand can read in the
 * diff, and the file it gets back is imported through the ordinary
 * `POST /products/import` — first with `dryRun`, then for real. Nothing here
 * writes, and nothing here decides a price: `csvClean.rules.js` only rewrites a
 * cell into the shape the importer already accepts.
 *
 * The model is asked about one thing: the product names the file could not
 * match. Its suggestion is then looked up in the catalogue for this shop, and a
 * suggestion that matches no item is reported as a hint, never written into the
 * file. That is what keeps a plausible-sounding invention out of the shop's
 * products.
 */
class CsvCleanError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const fixSchema = z.object({
  line: z.number().int().min(2).max(5000),
  name: z.string().trim().min(2).max(NAME_LIMIT),
  reason: z.string().trim().max(200).optional(),
});

const responseSchema = z.object({
  fixes: z.array(fixSchema).max(ROWS_PER_CALL * 2),
});

const chunk = (rows, size) => {
  const out = [];
  for (let start = 0; start < rows.length; start += size) out.push(rows.slice(start, start + size));
  return out;
};

/**
 * The same resolution the importer uses — barcode first, then the name's slug,
 * only ACTIVE global items plus this shop's own private ones, its own private
 * item winning over a global one of the same name. `key` is whatever the caller
 * wants back (a row line here), so a suggestion is verified against the real
 * catalogue and not against the model's confidence.
 */
async function resolveItems(brandId, wanted) {
  const slugs = [...new Set(wanted.map((row) => slugify(row.name || '')).filter(Boolean))];
  const barcodes = [...new Set(wanted.map((row) => row.barcode).filter(Boolean))];
  const found = new Map();
  if (!slugs.length && !barcodes.length) return found;

  const items = await CatalogProduct.find({
    status: 'ACTIVE',
    $and: [
      { $or: [{ scope: 'GLOBAL' }, { scope: 'PRIVATE', brandId }] },
      { $or: [{ slug: { $in: slugs } }, { barcode: { $in: barcodes } }] },
    ],
  });
  const byBarcode = new Map(items.filter((item) => item.barcode).map((item) => [item.barcode, item]));
  const bySlug = new Map();
  items.forEach((item) => {
    if (!bySlug.has(item.slug) || item.scope === 'PRIVATE') bySlug.set(item.slug, item);
  });
  for (const row of wanted) {
    const item = (row.barcode && byBarcode.get(row.barcode)) || bySlug.get(slugify(row.name || ''));
    if (item) found.set(row.key, item);
  }
  return found;
}

async function askForNames(rows, ctx) {
  const result = await generate({
    task: 'csv-clean',
    messages: [
      { role: 'system', content: CSV_CLEAN_SYSTEM },
      { role: 'user', content: buildCsvCleanInput({ rows }) },
    ],
    json: true,
    temperature: 0.1,
    maxTokens: 900,
    userId: ctx.userId,
    role: ctx.role,
  });
  return parseModelJson(result.text, responseSchema).fixes;
}

async function cleanCsv({ csv, ctx }) {
  if (!ctx || !ctx.brandId) {
    throw new CsvCleanError(403, 'This needs a brand account.', 'NO_BRAND');
  }

  const file = cleanText(csv);
  const warnings = [];
  if (file.ragged.length) {
    const one = file.ragged.length === 1;
    warnings.push(
      `Row${one ? '' : 's'} ${file.ragged.join(', ')} ${one ? 'has' : 'have'} more values than the file has columns, so the columns after the extra comma are shifted. ${one ? 'That row was' : 'Those rows were'} left exactly as you wrote them and were not matched or rewritten: re-save the file from the spreadsheet as CSV, then clean it again.`
    );
  }
  // Only a row whose columns line up has a name worth matching.
  const rows = file.dataRows
    .filter((row) => !row.ragged)
    .map((row) => ({
      key: row.line,
      line: row.line,
      name: file.cellOf(row, 'name'),
      barcode: file.cellOf(row, 'barcode'),
    }));

  const matched = await resolveItems(ctx.brandId, rows);
  const unnamed = rows.filter((row) => !row.name);
  const unmatched = rows.filter((row) => row.name && !matched.has(row.line));

  // The names the file cannot place are the only thing worth a model's time,
  // and only a bounded number of them: a 500-row file is not 500 prompts.
  const asked = unmatched.slice(0, MAX_ROWS_ASKED);
  const suggestions = new Map();
  let calls = 0;
  let failed = 0;
  let degraded = false;

  if (asked.length) {
    const answers = await Promise.all(
      chunk(asked, ROWS_PER_CALL).map(async (group) => {
        calls += 1;
        try {
          const fixes = await askForNames(
            group.map((row) => ({ line: row.line, name: row.name, ...(row.barcode && { barcode: row.barcode }) })),
            ctx
          );
          const allowed = new Set(group.map((row) => row.line));
          return fixes.filter((fix) => allowed.has(fix.line));
        } catch (err) {
          // One chunk failing costs the shop its suggestions for those rows, not
          // the whole preview: the text rules were applied by the server already.
          if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
            failed += 1;
            return [];
          }
          throw err;
        }
      })
    );
    degraded = failed > 0;
    for (const group of answers) {
      for (const fix of group) {
        const name = sanitizeUserText(fix.name, NAME_LIMIT);
        if (!name) continue;
        if (!suggestions.has(fix.line)) suggestions.set(fix.line, { name, reason: fix.reason || null });
      }
    }
  }

  // A suggestion only becomes a change once the catalogue says the item exists.
  const verified = suggestions.size
    ? await resolveItems(
        ctx.brandId,
        [...suggestions.entries()].map(([line, fix]) => ({
          key: line,
          name: fix.name,
          barcode: rows.find((row) => row.line === line)?.barcode,
        }))
      )
    : new Map();

  const changes = [...file.changes];
  const fixedByModel = [];
  for (const [line, fix] of suggestions) {
    const item = verified.get(line);
    if (!item) continue;
    const row = file.dataRows.find((dataRow) => dataRow.line === line);
    if (!row) continue;
    const index = file.columns.indexOf('name');
    const from = row.cells[index];
    if (from === fix.name) continue;
    row.cells[index] = fix.name;
    changes.push({
      line,
      column: 'name',
      from,
      to: fix.name,
      rule: `${fix.reason || 'The name was rewritten.'} CityCart has this product, so the row will import.`,
    });
    fixedByModel.push({ line, name: fix.name, catalogProductId: String(item._id), itemName: item.name });
  }

  const stillUnmatched = unmatched
    .filter((row) => !fixedByModel.some((fix) => fix.line === row.line))
    .map((row) => ({
      line: row.line,
      name: row.name,
      barcode: row.barcode || null,
      suggestion: suggestions.get(row.line)?.name || null,
    }))
    .concat(unnamed.map((row) => ({ line: row.line, name: '', barcode: row.barcode || null, suggestion: null })));

  return {
    summary: {
      rows: file.dataRows.length,
      cellsChanged: changes.length,
      rowsChanged: new Set(changes.map((change) => change.line)).size,
      matched: matched.size + fixedByModel.length,
      unmatched: stillUnmatched.length,
      asked: asked.length,
      notAsked: Math.max(0, unmatched.length - asked.length),
      ragged: file.ragged.length,
    },
    changes: changes.sort((a, b) => a.line - b.line || a.column.localeCompare(b.column)),
    unmatched: stillUnmatched.sort((a, b) => a.line - b.line),
    ignoredColumns: file.ignoredColumns,
    warnings,
    calls,
    degraded,
    csv: file.csv(),
    note: 'Nothing was imported. Run the normal check on this file, then import it when the diff looks right.',
  };
}

module.exports = { cleanCsv, CsvCleanError, resolveItems, responseSchema, NAME_LIMIT, MAX_ROWS_ASKED, ROWS_PER_CALL };
