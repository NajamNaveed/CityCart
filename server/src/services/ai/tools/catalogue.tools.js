const { z } = require('zod');

const Category = require('../../../models/category.model');
const Product = require('../../../models/product.model');
const { listForBrand } = require('../../catalog.service');
const { escapeRegex } = require('../../../utils/escapeRegex');

/**
 * Read-only catalogue tools for the catalogue matcher (docs/29 Phase 3b).
 *
 * A brand does not write a product's name, description or category — those come
 * from the shared catalogue — so the expensive mistake on the "Request a new
 * product" screen is asking for something that already exists, or a second
 * listing of something the shop already sells. These tools answer that with the
 * ordinary catalogue visibility rules (`listForBrand`: ACTIVE global items plus
 * the caller's own private items), so the matcher can never see a private item
 * belonging to another shop.
 *
 * The similarity is computed here, not by the model. Words are compared, a
 * quantity is glued to its unit first so "Basmati Rice 1kg" and "Basmati Rice
 * 5kg" score differently, and the score is reported with the words that matched
 * and the words that did not — so a human can check the judgement and the model
 * can only repeat it.
 */
const CANDIDATE_SCAN = 24;
const MATCH_LIMIT_DEFAULT = 8;
const MATCH_LIMIT_MAX = 8;
const OWN_SCAN = 60;
const OWN_LIMIT_DEFAULT = 6;
const OWN_LIMIT_MAX = 8;
// Three quarters of the words in the question must be in the item's own name
// before it is called a likely duplicate. Anything under that is "related".
const DUPLICATE_SCORE = 75;
const QUERY_LIMIT = 80;

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'with', 'in', 'on', 'to', 'from', 'by']);
const SIZE_UNITS = 'kg|g|gm|l|ml|litre|liter|pack|pcs|pc|piece|pieces|dozen|tin|jar|bag|bottle';

/**
 * Search words for matching: lower-cased, punctuation dropped, a number joined
 * to the unit that follows it. Order is kept and duplicates removed.
 */
function tokens(text) {
  const glued = String(text || '')
    .toLowerCase()
    // "1 kg" and "1kg" must score as one word, so the space between a number
    // and its unit is dropped. The lookahead leaves the unit in place.
    .replace(new RegExp(`(\\d)\\s+(?=(?:${SIZE_UNITS})\\b)`, 'g'), '$1');
  const seen = [];
  for (const word of glued.split(/[^a-z0-9]+/)) {
    if (word.length < 2 || STOPWORDS.has(word) || seen.includes(word)) continue;
    seen.push(word);
  }
  return seen;
}

/** How much of the question's own words appear in this row's words. */
function scoreMatch(queryTokens, rowTokens) {
  if (!queryTokens.length) return { score: 0, matchedTokens: [], missingTokens: [] };
  const row = new Set(rowTokens);
  const matchedTokens = queryTokens.filter((word) => row.has(word));
  const missingTokens = queryTokens.filter((word) => !row.has(word));
  return {
    score: Math.round((matchedTokens.length / queryTokens.length) * 100),
    matchedTokens,
    missingTokens,
  };
}

const SIZE_TOKEN = new RegExp(`^(\\d+)(${SIZE_UNITS})$`);
// The catalogue picker searches one literal phrase. A matcher that wants every
// spelling of the same item asks for the phrase, then each word, then each size
// with its space back — bounded, because every term is another scan.
const MAX_SEARCH_TERMS = 8;

/** The literal phrases worth one catalogue query each for this question. */
function searchTerms(query, barcode) {
  const terms = [query, ...(barcode ? [barcode] : [])];
  for (const word of tokens(query)) {
    terms.push(word);
    const size = SIZE_TOKEN.exec(word);
    if (size) terms.push(`${size[1]} ${size[2]}`);
  }
  return [...new Set(terms.filter(Boolean))].slice(0, MAX_SEARCH_TERMS);
}

/** A barcode that identifies the same physical item beats any amount of text. */
function isLikelyDuplicate({ score, sameBarcode }) {
  return sameBarcode || score >= DUPLICATE_SCORE;
}

async function categoryNames(categoryIds) {
  if (!categoryIds.length) return new Map();
  const rows = await Category.find({ _id: { $in: categoryIds } }).select('name').lean();
  return new Map(rows.map((row) => [String(row._id), row.name]));
}

const searchCatalogueTool = {
  name: 'search_catalogue',
  argsHint: '{ query?: string, barcode?: string }',
  description:
    'Search the shared CityCart catalogue for an item: every active global item plus this shop’s own private ones. Give the product words (for example "basmati rice 1kg") or a barcode, or both. Returns each item with the words of the question it matched, the words it did not, whether the barcode is the same, whether this shop already lists it, and whether it looks like the same item.',
  argsSchema: z
    .object({
      query: z.string().trim().min(2).max(QUERY_LIMIT).optional(),
      barcode: z
        .string()
        .trim()
        .regex(/^[0-9A-Za-z-]{6,40}$/, 'A barcode is 6-40 digits, letters or dashes.')
        .optional(),
      limit: z.number().int().min(1).max(MATCH_LIMIT_MAX).optional(),
    })
    .strict()
    .refine((args) => args.query || args.barcode, {
      message: 'Give some product words or a barcode.',
      path: ['query'],
    }),
  async run(ctx, args) {
    const limit = args.limit || MATCH_LIMIT_DEFAULT;
    const terms = searchTerms(args.query || '', args.barcode || '');
    // Every term goes through listForBrand — the same read the catalogue picker
    // uses — so the matcher can never be shown an item this shop could not have
    // picked itself: ACTIVE global items and this shop's own private ones only.
    const pages = await Promise.all(
      terms.map((term) => listForBrand(ctx.brandId, { q: term, limit: CANDIDATE_SCAN, page: 1 }))
    );
    const byId = new Map();
    for (const page of pages) {
      for (const item of page.items) byId.set(String(item._id), item);
    }
    const items = [...byId.values()];

    const queryTokens = tokens(args.query || args.barcode || '');
    const ids = items.map((item) => String(item._id));
    // Does this shop already list any of these? That is a duplicate of a
    // different kind, and the shop's own product table is the only place read.
    const listings = ids.length
      ? await Product.find({ brandId: ctx.brandId, catalogProductId: { $in: ids } })
          .select('catalogProductId')
          .lean()
      : [];
    const listedSet = new Set(listings.map((listing) => String(listing.catalogProductId)));
    const names = await categoryNames([...new Set(items.map((item) => String(item.categoryId)))]);

    const rows = items
      .map((item) => {
        const sameBarcode = Boolean(args.barcode && item.barcode && item.barcode === args.barcode);
        const scored = scoreMatch(queryTokens, tokens(`${item.name} ${item.manufacturer || ''} ${item.size?.value ?? ''}${item.size?.unit ?? ''}`));
        // The barcode itself is a full match even when the words differ.
        const match = sameBarcode ? { ...scored, score: 100 } : scored;
        return ctx.rememberCatalogue({
          catalogProductId: String(item._id),
          name: item.name,
          manufacturer: item.manufacturer || null,
          category: names.get(String(item.categoryId)) || null,
          size: item.size?.value ? { value: item.size.value, unit: item.size.unit || null } : null,
          barcode: item.barcode || null,
          scope: item.scope,
          imageCount: (item.images || []).length,
          sameBarcode,
          listedByYou: listedSet.has(String(item._id)),
          likelyDuplicate: isLikelyDuplicate({ score: match.score, sameBarcode }),
          ...match,
        });
      })
      .sort((a, b) => {
        if (a.sameBarcode !== b.sameBarcode) return a.sameBarcode ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);

    return {
      asked: { query: args.query || null, barcode: args.barcode || null, words: queryTokens, terms },
      currency: 'Pakistani rupees',
      scanned: items.length,
      count: rows.length,
      rule: `An item is a likely duplicate when the barcode is the same or at least ${DUPLICATE_SCORE}% of the question's words appear in its name.`,
      items: rows,
    };
  },
};

const listShopListingsTool = {
  name: 'list_shop_listings',
  argsHint: '{ query: string, limit?: 1-8 }',
  description:
    'Search this shop’s own product listings (any visibility, never archived) for product words or an SKU. Returns the listing’s name, its price in rupees, its visibility, the catalogue item behind it if it has one, the same match words as the catalogue search, and whether that catalogue item is one the catalogue search found.',
  argsSchema: z
    .object({
      query: z.string().trim().min(2).max(QUERY_LIMIT),
      limit: z.number().int().min(1).max(OWN_LIMIT_MAX).optional(),
    })
    .strict(),
  async run(ctx, args) {
    const limit = args.limit || OWN_LIMIT_DEFAULT;
    const queryTokens = tokens(args.query);
    if (!queryTokens.length) {
      return { asked: { query: args.query, words: [] }, count: 0, currency: 'Pakistani rupees', products: [] };
    }

    // One literal substring per word, escaped the same way the marketplace
    // search escapes it, so nothing the shop typed can become a pattern. The
    // brand id is in the query itself: another shop's listings are not read.
    const words = queryTokens.slice(0, 8);
    const rx = words.map((word) => ({ name: { $regex: escapeRegex(word), $options: 'i' } }));
    const found = await Product.find({
      brandId: ctx.brandId,
      status: { $ne: 'ARCHIVED' },
      $or: [...rx, { sku: { $regex: `^${escapeRegex(args.query)}$`, $options: 'i' } }],
    })
      .select('name price compareAtPrice status catalogProductId sku isActive categoryId')
      .limit(OWN_SCAN)
      .lean();

    const rows = found.map((product) => {
      const match = scoreMatch(queryTokens, tokens(product.name));
      return ctx.rememberOwnListing({
        productId: String(product._id),
        name: product.name,
        price: product.price,
        compareAtPrice: product.compareAtPrice ?? null,
        currency: 'Pakistani rupees',
        status: product.status,
        isActive: product.isActive !== false,
        sku: product.sku || null,
        catalogProductId: product.catalogProductId ? String(product.catalogProductId) : null,
        categoryId: product.categoryId ? String(product.categoryId) : null,
        ...match,
      });
    });

    const names = await categoryNames(rows.map((row) => row.categoryId).filter(Boolean));
    for (const row of rows) row.category = names.get(row.categoryId) || null;

    return {
      asked: { query: args.query, words: queryTokens },
      currency: 'Pakistani rupees',
      scanned: found.length,
      count: rows.length,
      note: 'Only this shop’s own listings are searched, at any visibility, never another shop’s.',
      products: rows
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, limit),
    };
  },
};

module.exports = {
  searchCatalogueTool,
  listShopListingsTool,
  tokens,
  scoreMatch,
  searchTerms,
  isLikelyDuplicate,
  DUPLICATE_SCORE,
  MATCH_LIMIT_DEFAULT,
  MATCH_LIMIT_MAX,
  OWN_LIMIT_DEFAULT,
  OWN_LIMIT_MAX,
  QUERY_LIMIT,
};
