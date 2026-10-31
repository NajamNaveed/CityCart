const Product = require('../models/product.model');
const CatalogProduct = require('../models/catalogProduct.model');
const Branch = require('../models/branch.model');
const Inventory = require('../models/inventory.model');
const { parseCsv, toCsv } = require('../utils/csv');
const { slugify } = require('../utils/slugify');
const { createProductSchema } = require('../validators/product.validator');
const { formatZodError } = require('../utils/formatZodError');
const { createProduct, applyProductUpdate, getProductByIdRaw, ProductError } = require('./product.service');
const { updateInventory } = require('./inventory.service');

/**
 * CSV import / export of a brand's products.
 *
 * Import goes through the SAME service functions as the dashboard form
 * (createProduct / applyProductUpdate / updateInventory), so every rule —
 * catalogue membership, branch ownership, one listing per item, stock limits —
 * applies row by row. `brandId` always comes from the caller's session, never the file.
 *
 * Marketplace v2 (docs/22): a row lists an item that ALREADY exists in the shared
 * catalogue. It is found by `barcode` when given, otherwise by `name`. A row can
 * set only the store's own price, SKU, status, stock and branches; the item's
 * name, category, description and images belong to the catalogue.
 */
class CsvImportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const COLUMNS = [
  'name',
  'barcode',
  'sku',
  'price',
  'compareAtPrice',
  'status',
  'quantity',
  'lowStockThreshold',
  'branches',
];
const REQUIRED_COLUMNS = ['name', 'price'];
const IMPORT_STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE'];
const MAX_IMPORT_ROWS = 500;
const MAX_EXPORT_ROWS = 5000;
const MAX_ERRORS_RETURNED = 100;

const normalizeHeader = (h) => String(h).trim().toLowerCase().replace(/[\s_-]/g, '');
const COLUMN_BY_HEADER = new Map(COLUMNS.map((c) => [normalizeHeader(c), c]));

const splitList = (value) =>
  String(value || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

function wholeNumber(value, label, messages) {
  if (!/^\d+$/.test(value)) {
    messages.push(`${label} must be a whole number of 0 or more.`);
    return undefined;
  }
  return Number(value);
}

const asIds = (list) => (list || []).map(String);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * True when the row would change nothing: every value the row provides equals
 * what the shop already has. Such rows are counted as "unchanged" and skipped,
 * so re-importing an exported file does not rewrite products (or stock) for
 * no reason.
 */
function isUnchanged(existing, data, inventory, stock) {
  if (existing.isActive === false) return false; // an archived product would be restored
  const checks = [
    data.sku === undefined || data.sku === existing.sku,
    data.price === undefined || data.price === existing.price,
    data.compareAtPrice === undefined || data.compareAtPrice === existing.compareAtPrice,
    data.status === undefined || data.status === existing.status,
    data.branchIds === undefined || sameSet(asIds(data.branchIds), asIds(existing.branchIds)),
    stock.quantity === undefined || (inventory && inventory.quantity === stock.quantity),
    stock.lowStockThreshold === undefined || (inventory && inventory.lowStockThreshold === stock.lowStockThreshold),
  ];
  return checks.every(Boolean);
}

async function exportBrandProducts(brandId) {
  // Archived products are removed from the shop, so they are left out: the file can always be imported back.
  const products = await Product.find({ brandId, status: { $ne: 'ARCHIVED' } }).sort({ createdAt: 1 }).limit(MAX_EXPORT_ROWS);
  const ids = products.map((p) => p._id);
  const [items, branches, inventories] = await Promise.all([
    ids.length ? CatalogProduct.find({ _id: { $in: products.map((p) => p.catalogProductId) } }) : [],
    Branch.find({ brandId }),
    ids.length ? Inventory.find({ brandId, productId: { $in: ids } }) : [],
  ]);
  const barcodeOf = new Map(items.map((i) => [String(i._id), i.barcode || '']));
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const stock = new Map(inventories.map((i) => [String(i.productId), i]));

  const rows = [COLUMNS];
  for (const p of products) {
    const inv = stock.get(String(p._id));
    rows.push([
      p.name,
      barcodeOf.get(String(p.catalogProductId)) || '',
      p.sku || '',
      p.price,
      p.compareAtPrice ?? '',
      p.status,
      inv ? inv.quantity : '',
      inv ? inv.lowStockThreshold : '',
      (p.branchIds || []).map((id) => branchName.get(String(id))).filter(Boolean).join('|'),
    ]);
  }
  return toCsv(rows);
}

/**
 * Validates every row, then (unless dryRun) writes the valid ones. A bad row
 * never stops the others; it is reported with its spreadsheet row number.
 */
async function importBrandProducts(brandId, text, { dryRun = false, canManageStock = false } = {}) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (err) {
    throw new CsvImportError(400, err.message);
  }
  if (rows.length === 0 || rows[0].every((h) => !String(h).trim())) {
    throw new CsvImportError(400, 'The file is empty.');
  }

  const columns = rows[0].map((h) => COLUMN_BY_HEADER.get(normalizeHeader(h)));
  const ignoredColumns = rows[0].filter((h, i) => !columns[i] && String(h).trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    throw new CsvImportError(400, `Missing required column(s): ${missing.join(', ')}.`);
  }

  const dataRows = rows
    .slice(1)
    .map((cells, i) => ({ cells, line: i + 2 }))
    .filter(({ cells }) => cells.some((c) => String(c).trim() !== ''));
  if (dataRows.length === 0) {
    throw new CsvImportError(400, 'The file has no product rows.');
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new CsvImportError(400, `A file can have at most ${MAX_IMPORT_ROWS} products. Split it into smaller files.`);
  }

  // Find the catalogue items the file refers to (by barcode or by name), limited to
  // what this store may use: active global items and its own private ones.
  const cell = (row, column) => {
    const index = columns.indexOf(column);
    return index === -1 ? '' : String(row.cells[index] ?? '').trim();
  };
  const wantedSlugs = [...new Set(dataRows.map((r) => slugify(cell(r, 'name'))).filter(Boolean))];
  const wantedBarcodes = [...new Set(dataRows.map((r) => cell(r, 'barcode')).filter(Boolean))];
  const [catalogItems, branches, existing, inventories] = await Promise.all([
    CatalogProduct.find({
      status: 'ACTIVE',
      $and: [
        { $or: [{ scope: 'GLOBAL' }, { scope: 'PRIVATE', brandId }] },
        { $or: [{ slug: { $in: wantedSlugs } }, { barcode: { $in: wantedBarcodes } }] },
      ],
    }),
    Branch.find({ brandId }),
    Product.find({ brandId }),
    Inventory.find({ brandId }),
  ]);
  const itemByBarcode = new Map(catalogItems.filter((i) => i.barcode).map((i) => [i.barcode, i]));
  const itemBySlug = new Map();
  // The store's own private item wins over a global one with the same name.
  catalogItems.forEach((i) => {
    if (!itemBySlug.has(i.slug) || i.scope === 'PRIVATE') itemBySlug.set(i.slug, i);
  });
  const branchByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b]));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku, p]));
  const byCatalogId = new Map(existing.map((p) => [String(p.catalogProductId), p]));
  const stockByProduct = new Map(inventories.map((i) => [String(i.productId), i]));

  const result = { dryRun, total: dataRows.length, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [], warnings: [], ignoredColumns };
  if (!canManageStock && columns.some((c) => c === 'quantity' || c === 'lowStockThreshold')) {
    result.warnings.push('Stock columns were ignored because you do not have permission to manage stock.');
  }
  const fail = (line, name, messages) => {
    result.failed += 1;
    if (result.errors.length < MAX_ERRORS_RETURNED) result.errors.push({ row: line, name, messages });
  };

  const seenItem = new Map();
  const seenSku = new Map();

  for (const { cells, line } of dataRows) {
    const get = (column) => {
      const index = columns.indexOf(column);
      return index === -1 ? '' : String(cells[index] ?? '').trim();
    };
    const name = get('name');
    const messages = [];

    // ---- the catalogue item this row lists
    const barcode = get('barcode');
    const item = (barcode && itemByBarcode.get(barcode)) || itemBySlug.get(slugify(name));
    if (!item) {
      messages.push(
        `"${name}" is not in the CityCart catalogue. Ask the CityCart admin to add it, or request it from your dashboard.`
      );
    } else if (seenItem.has(String(item._id))) {
      messages.push(`Same product as row ${seenItem.get(String(item._id))}.`);
    }
    const sku = get('sku');
    if (sku && seenSku.has(sku)) messages.push(`Same SKU as row ${seenSku.get(sku)}.`);

    const branchIds = [];
    for (const label of splitList(get('branches'))) {
      const branch = branchByName.get(label.toLowerCase());
      if (branch) branchIds.push(String(branch._id));
      else messages.push(`Unknown branch "${label}".`);
    }

    const status = get('status').toUpperCase();
    if (status && !IMPORT_STATUSES.includes(status)) {
      messages.push(`Status must be one of ${IMPORT_STATUSES.join(', ')}.`);
    }

    // ---- numbers and stock
    const payload = {
      catalogProductId: item ? String(item._id) : undefined,
      price: get('price') === '' ? undefined : Number(get('price')),
      sku: sku || undefined,
      status: status || undefined,
      branchIds,
      ...(get('compareAtPrice') !== '' && { compareAtPrice: Number(get('compareAtPrice')) }),
    };
    const parsed = createProductSchema.safeParse(payload);
    if (!parsed.success) {
      formatZodError(parsed.error).forEach((e) => messages.push(`${e.field}: ${e.message}`));
    }

    let quantity;
    let lowStockThreshold;
    if (canManageStock) {
      if (get('quantity') !== '') quantity = wholeNumber(get('quantity'), 'quantity', messages);
      if (get('lowStockThreshold') !== '') lowStockThreshold = wholeNumber(get('lowStockThreshold'), 'lowStockThreshold', messages);
    }

    if (messages.length) {
      fail(line, name, messages);
      continue;
    }
    seenItem.set(String(item._id), line);
    if (sku) seenSku.set(sku, line);

    // ---- create or update (matched by SKU, else by name)
    const bySkuMatch = sku && bySku.get(sku);
    if (bySkuMatch && String(bySkuMatch.catalogProductId) !== String(item._id)) {
      fail(line, name, [`SKU "${sku}" already belongs to another product of yours.`]);
      continue;
    }
    const match = bySkuMatch || byCatalogId.get(String(item._id));
    if (match && isUnchanged(match, parsed.data, stockByProduct.get(String(match._id)), { quantity, lowStockThreshold })) {
      result.unchanged += 1;
      continue;
    }
    const existingId = match && match._id;
    try {
      if (!dryRun) {
        // An update also makes the product visible again (isActive), so a row
        // can bring back a product that was archived.
        const data = existingId ? { ...parsed.data, isActive: true } : { ...parsed.data, status: parsed.data.status || 'DRAFT' };
        let product;
        if (existingId) {
          product = await getProductByIdRaw(existingId);
          const changes = { ...data };
          delete changes.catalogProductId; // the item a listing points at never changes
          await applyProductUpdate(product, changes);
        } else {
          product = await createProduct(brandId, data);
        }
        if (quantity !== undefined || lowStockThreshold !== undefined) {
          await updateInventory(product, {
            ...(quantity !== undefined && { quantity }),
            ...(lowStockThreshold !== undefined && { lowStockThreshold }),
          });
        }
      }
      if (existingId) result.updated += 1;
      else result.created += 1;
    } catch (err) {
      if (err instanceof ProductError || err.status) {
        fail(line, name, [err.message]);
      } else {
        throw err;
      }
    }
  }

  return result;
}

module.exports = {
  exportBrandProducts,
  importBrandProducts,
  CsvImportError,
  COLUMNS,
  MAX_IMPORT_ROWS,
};
