const Product = require('../models/product.model');
const Category = require('../models/category.model');
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
 * category ownership, branch ownership, unique names, stock limits — applies
 * row by row. `brandId` always comes from the caller's session, never the file.
 */
class CsvImportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const COLUMNS = [
  'name',
  'sku',
  'category',
  'price',
  'compareAtPrice',
  'status',
  'quantity',
  'lowStockThreshold',
  'description',
  'images',
  'branches',
];
const REQUIRED_COLUMNS = ['name', 'category', 'price'];
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
    data.name === undefined || data.name === existing.name,
    data.sku === undefined || data.sku === existing.sku,
    data.price === undefined || data.price === existing.price,
    data.compareAtPrice === undefined || data.compareAtPrice === existing.compareAtPrice,
    data.status === undefined || data.status === existing.status,
    data.description === undefined || data.description === existing.description,
    data.categoryId === undefined || String(data.categoryId) === String(existing.categoryId),
    data.images === undefined || JSON.stringify(data.images) === JSON.stringify(existing.images || []),
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
  const [categories, branches, inventories] = await Promise.all([
    Category.find({ brandId }),
    Branch.find({ brandId }),
    ids.length ? Inventory.find({ brandId, productId: { $in: ids } }) : [],
  ]);
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const stock = new Map(inventories.map((i) => [String(i.productId), i]));

  const rows = [COLUMNS];
  for (const p of products) {
    const inv = stock.get(String(p._id));
    rows.push([
      p.name,
      p.sku || '',
      categoryName.get(String(p.categoryId)) || '',
      p.price,
      p.compareAtPrice ?? '',
      p.status,
      inv ? inv.quantity : '',
      inv ? inv.lowStockThreshold : '',
      p.description || '',
      (p.images || []).join('|'),
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

  const [categories, branches, existing, inventories] = await Promise.all([
    Category.find({ brandId }),
    Branch.find({ brandId }),
    Product.find({ brandId }),
    Inventory.find({ brandId }),
  ]);
  const categoryByKey = new Map();
  categories.forEach((c) => {
    categoryByKey.set(c.name.trim().toLowerCase(), c);
    categoryByKey.set(String(c.slug || '').toLowerCase(), c);
  });
  const branchByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b]));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku, p]));
  const bySlug = new Map(existing.map((p) => [p.slug, p]));
  const stockByProduct = new Map(inventories.map((i) => [String(i.productId), i]));

  const result = { dryRun, total: dataRows.length, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [], warnings: [], ignoredColumns };
  if (!canManageStock && columns.some((c) => c === 'quantity' || c === 'lowStockThreshold')) {
    result.warnings.push('Stock columns were ignored because you do not have permission to manage stock.');
  }
  const fail = (line, name, messages) => {
    result.failed += 1;
    if (result.errors.length < MAX_ERRORS_RETURNED) result.errors.push({ row: line, name, messages });
  };

  const seenSlug = new Map();
  const seenSku = new Map();

  for (const { cells, line } of dataRows) {
    const get = (column) => {
      const index = columns.indexOf(column);
      return index === -1 ? '' : String(cells[index] ?? '').trim();
    };
    const name = get('name');
    const messages = [];

    // ---- duplicates inside the file
    const slug = slugify(name);
    if (slug && seenSlug.has(slug)) messages.push(`Same product name as row ${seenSlug.get(slug)}.`);
    const sku = get('sku');
    if (sku && seenSku.has(sku)) messages.push(`Same SKU as row ${seenSku.get(sku)}.`);

    // ---- references
    const category = categoryByKey.get(get('category').toLowerCase());
    if (!category) messages.push(`Unknown category "${get('category')}". Create it first under Categories.`);

    const branchIds = [];
    for (const label of splitList(get('branches'))) {
      const branch = branchByName.get(label.toLowerCase());
      if (branch) branchIds.push(String(branch._id));
      else messages.push(`Unknown branch "${label}".`);
    }

    const images = splitList(get('images'));
    if (images.some((url) => !/^https?:\/\//i.test(url))) messages.push('Every image must be a full http(s) link.');

    const status = get('status').toUpperCase();
    if (status && !IMPORT_STATUSES.includes(status)) {
      messages.push(`Status must be one of ${IMPORT_STATUSES.join(', ')}.`);
    }

    // ---- numbers and stock
    const payload = {
      name,
      price: get('price') === '' ? undefined : Number(get('price')),
      categoryId: category ? String(category._id) : undefined,
      description: get('description') || undefined,
      images: images.length ? images : undefined,
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
    if (slug) seenSlug.set(slug, line);
    if (sku) seenSku.set(sku, line);

    // ---- create or update (matched by SKU, else by name)
    const match = (sku && bySku.get(sku)) || bySlug.get(slug);
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
          await applyProductUpdate(product, data);
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
