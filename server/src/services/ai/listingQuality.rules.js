const PRODUCT_STATUSES = require('../../models/product.model').STATUSES;

/**
 * The scoring half of the listing quality check (docs/29 Phase 3d-3), pure on
 * purpose.
 *
 * A shop asking "why is this page not selling?" is asking a question about its
 * own record, and the answer is a count: how many words are written, how many
 * photos are attached, how many attributes are filled, what the stock row says.
 * All of that is worked out here and tested here, so the number a shop reads is
 * arithmetic, never the model's impression — and the model is only ever allowed
 * to re-word a gap this file already found.
 *
 * The weights are a judgement about what actually costs a small Pakistani
 * neighbourhood shop its sale, and they are deliberately published as numbers
 * the shop can see: a photo and a description move a shopper, a SKU code does
 * not. Nothing here is a verdict on the product itself — a perfect score does
 * not promise a sale, and a low one does not mean the goods are bad.
 */

const WEIGHTS = {
  name: 15,
  description: 25,
  images: 25,
  attributes: 10,
  price: 10,
  sku: 5,
  stock: 10,
};

const CHECK_ORDER = Object.keys(WEIGHTS);

const LABELS = {
  name: 'Name',
  description: 'Description',
  images: 'Photos',
  attributes: 'Details filled in',
  price: 'Price shown',
  sku: 'SKU code',
  stock: 'Stock on hand',
};

// The bands a check is graded on. Kept as plain thresholds with the reason each
// one exists, so the panel can print the same words the model was given.
const NAME_MIN_WORDS = 2;
const DESCRIPTION_MIN_WORDS = 25;
const DESCRIPTION_GOOD_WORDS = 60;
const IMAGE_TARGET = 3;
const ATTRIBUTE_TARGET = 2;

const STATUS_LABELS = {
  GOOD: 'as good as it gets here',
  WEAK: 'partly filled',
  MISSING: 'nothing filled',
  BROKEN: 'says something false',
  UNTRACKED: 'not measured',
};

const round = (value) => Math.max(0, Math.round(Number(value) || 0));

const countWords = (value) =>
  typeof value === 'string' && value.trim() ? value.trim().split(/\s+/).length : 0;

const money = (value) => `Rs. ${round(value).toLocaleString('en-PK')}`;

/**
 * Attributes are Mixed by design (docs/04 §17), so both shapes the app has ever
 * written are read: an object of pairs, or a list of {name, value} items. A key
 * whose value is blank is not a filled detail.
 */
function countAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object') return 0;
  if (Array.isArray(attributes)) {
    return attributes.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const value = item.value ?? item.val ?? item.name;
      return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
    }).length;
  }
  return Object.values(attributes).filter((value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== false;
  }).length;
}

function countImages(images) {
  if (!Array.isArray(images)) return 0;
  return images.filter((image) => typeof image === 'string' && image.trim()).length;
}

function checkName(name) {
  const words = countWords(name);
  if (words === 0) {
    return { points: 0, status: 'MISSING', facts: 'The listing has no name at all.' };
  }
  if (words < NAME_MIN_WORDS) {
    return {
      points: Math.round(WEIGHTS.name / 2),
      status: 'WEAK',
      facts: `The name is one word ("${name}"). A shopper searching for the brand, the size or the pack will not find it, so a second word that says what it is costs nothing and brings in searches.`,
    };
  }
  return {
    points: WEIGHTS.name,
    status: 'GOOD',
    facts: `The name has ${words} ${words === 1 ? 'word' : 'words'}, which is enough to be found by.`,
  };
}

function checkDescription(description) {
  const words = countWords(description);
  if (words === 0) {
    return {
      points: 0,
      status: 'MISSING',
      facts: 'Nothing is written in the description, so the shopper decides from the photo alone.',
    };
  }
  if (words < DESCRIPTION_MIN_WORDS) {
    return {
      points: Math.round(WEIGHTS.description / 5),
      status: 'WEAK',
      facts: `The description is ${words} ${words === 1 ? 'word' : 'words'} — too short for the size, the brand or what actually arrives.`,
    };
  }
  if (words < DESCRIPTION_GOOD_WORDS) {
    return {
      points: Math.round(WEIGHTS.description * 0.6),
      status: 'WEAK',
      facts: `The description is ${words} words. It says something, but the last ${
        DESCRIPTION_GOOD_WORDS - words
      } words are what usually answers the question a shopper phones about.`,
    };
  }
  return {
    points: WEIGHTS.description,
    status: 'GOOD',
    facts: `The description is ${words} words, which is a full page.`,
  };
}

function checkImages(images) {
  const count = countImages(images);
  if (count === 0) {
    return {
      points: 0,
      status: 'MISSING',
      facts: 'No photo is attached, so this listing is invisible in every picture row a shopper browses.',
    };
  }
  if (count >= IMAGE_TARGET) {
    return {
      points: WEIGHTS.images,
      status: 'GOOD',
      facts: `${count} ${count === 1 ? 'photo' : 'photos'} attached.`,
    };
  }
  return {
    points: Math.round((WEIGHTS.images * count) / IMAGE_TARGET),
    status: 'WEAK',
    facts: `${count} of the ${IMAGE_TARGET} photos a shopper likes to see. The second and third are usually the pack, the label and what is inside.`,
  };
}

function checkAttributes(attributes) {
  const filled = countAttributes(attributes);
  if (filled === 0) {
    return {
      points: 0,
      status: 'MISSING',
      facts: 'No details are filled in, so this listing cannot appear under a brand, a pack size or any other filter a shopper uses.',
    };
  }
  if (filled < ATTRIBUTE_TARGET) {
    return {
      points: Math.round(WEIGHTS.attributes / 2),
      status: 'WEAK',
      facts: `${filled} of the details filled in. Filters need at least a couple — the brand, the size, the unit.`,
    };
  }
  return {
    points: WEIGHTS.attributes,
    status: 'GOOD',
    facts: `${filled} details filled in, enough to be filtered by.`,
  };
}

function checkPrice({ price, compareAtPrice }) {
  const has = Number.isFinite(Number(price)) && Number(price) > 0;
  if (!has) {
    return {
      points: 0,
      status: 'BROKEN',
      facts: `The price on the listing is ${money(price)}, so nobody can order it.`,
    };
  }
  // `Number(null)` is 0, and a listing with no compare-at price is not a
  // listing priced at nothing — so the absence is read before the number.
  const compare =
    compareAtPrice === null || compareAtPrice === undefined || !Number.isFinite(Number(compareAtPrice))
      ? null
      : Number(compareAtPrice);
  if (compare === null) {
    return {
      points: WEIGHTS.price,
      status: 'GOOD',
      facts: `One honest price of ${money(price)}, nothing struck through. That is fine — a discount is not required.`,
    };
  }
  if (compare < Number(price)) {
    return {
      points: 0,
      status: 'BROKEN',
      facts: `The compare-at price (${money(compare)}) is below the price the shopper actually pays (${money(price)}). The page shows a discount that does not exist, and a shopper who notices does not come back.`,
    };
  }
  if (compare === Number(price)) {
    return {
      points: Math.round(WEIGHTS.price / 2),
      status: 'WEAK',
      facts: `The compare-at price is the same as the price (${money(price)}), so nothing is struck through and the page looks like a mistake.`,
    };
  }
  const saved = round(compare - price);
  return {
    points: WEIGHTS.price,
    status: 'GOOD',
    facts: `${money(price)} against a compare-at of ${money(compare)}, so the shopper sees ${money(saved)} saved.`,
  };
}

function checkSku(sku) {
  const value = typeof sku === 'string' ? sku.trim() : '';
  if (!value) {
    return {
      points: 0,
      status: 'MISSING',
      facts: 'No SKU code, so this listing is harder to find in the shop\'s own stock records and its own packing list.',
    };
  }
  return { points: WEIGHTS.sku, status: 'GOOD', facts: `SKU ${value}.` };
}

function checkStock(inventory) {
  if (!inventory) {
    return {
      points: 0,
      status: 'MISSING',
      facts: 'There is no stock record for this listing at all, so the shop cannot see how many it has and a shopper cannot be promised one.',
    };
  }
  if (inventory.trackInventory === false) {
    return {
      points: Math.round(WEIGHTS.stock / 2),
      status: 'UNTRACKED',
      facts: 'Stock is not tracked for this listing, so no availability count is shown to a shopper and an order can arrive that the shelf cannot fill.',
    };
  }
  const available = round(inventory.quantity) - round(inventory.reservedQuantity);
  const threshold = round(inventory.lowStockThreshold);
  if (available <= 0) {
    return {
      points: 0,
      status: 'MISSING',
      facts: `Nothing is available: ${round(inventory.quantity)} on hand minus ${round(
        inventory.reservedQuantity,
      )} already held for other orders. A page that cannot be delivered from is the one a shopper remembers as a disappointment.`,
    };
  }
  if (threshold > 0 && available <= threshold) {
    return {
      points: Math.round(WEIGHTS.stock / 2),
      status: 'WEAK',
      facts: `${available} available and the shop\'s own warning is set at ${threshold}, so this listing is already running short.`,
    };
  }
  return { points: WEIGHTS.stock, status: 'GOOD', facts: `${available} available.` };
}

/**
 * What the listing says about whether shoppers can even see it. Deliberately
 * not scored: a draft is not a bad listing, it is an unfinished one, and mixing
 * the two would push a shop to publish before it is ready.
 */
function visibilityOf(product) {
  const status = PRODUCT_STATUSES.includes(product.status) ? product.status : 'DRAFT';
  const isActive = product.isActive !== false;
  let note;
  if (status === 'ARCHIVED') note = 'Archived, so it is not for sale anywhere in the city.';
  else if (status === 'DRAFT') note = 'A draft. Only this shop can see it yet.';
  else if (!isActive || status === 'INACTIVE') note = 'Set to inactive, so shoppers cannot find it.';
  else note = 'Active, so shoppers can see it now.';
  return { status, isActive, note };
}

/**
 * @param product   this brand's own lean Product row
 * @param inventory this brand's own lean Inventory row for the same product, or null
 */
function scoreListing({ product, inventory } = {}) {
  if (!product || typeof product !== 'object') {
    throw new TypeError('scoreListing needs the listing it is scoring');
  }

  const checks = CHECK_ORDER.map((key) => ({
    key,
    label: LABELS[key],
    weight: WEIGHTS[key],
  })).map((row) => {
    const graded = {
      name: () => checkName(product.name),
      description: () => checkDescription(product.description),
      images: () => checkImages(product.images),
      attributes: () => checkAttributes(product.attributes),
      price: () => checkPrice(product),
      sku: () => checkSku(product.sku),
      stock: () => checkStock(inventory),
    }[row.key]();
    return { ...row, ...graded, gap: row.weight - graded.points };
  });

  const score = checks.reduce((sum, row) => sum + row.points, 0);
  // Biggest gap first, and the published order second, so two equal gaps never
  // swap places between two runs of the same listing.
  const fixes = checks
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap || CHECK_ORDER.indexOf(a.key) - CHECK_ORDER.indexOf(b.key))
    .map((row) => row.key);

  return {
    score: Math.min(100, Math.max(0, score)),
    checks,
    fixes,
    visibility: visibilityOf(product),
    weights: { ...WEIGHTS },
    thresholds: {
      nameMinWords: NAME_MIN_WORDS,
      descriptionMinWords: DESCRIPTION_MIN_WORDS,
      descriptionGoodWords: DESCRIPTION_GOOD_WORDS,
      imageTarget: IMAGE_TARGET,
      attributeTarget: ATTRIBUTE_TARGET,
    },
  };
}

module.exports = {
  scoreListing,
  countAttributes,
  countImages,
  countWords,
  visibilityOf,
  moneyText: money,
  WEIGHTS,
  CHECK_ORDER,
  LABELS,
  STATUS_LABELS,
  NAME_MIN_WORDS,
  DESCRIPTION_MIN_WORDS,
  DESCRIPTION_GOOD_WORDS,
  IMAGE_TARGET,
  ATTRIBUTE_TARGET,
};
