const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const Inventory = require('../models/inventory.model');
const { MAX_ITEM_QUANTITY } = require('../validators/cart.validator');

const MAX_CART_LINES = 50;
const MAX_WRITE_ATTEMPTS = 3;

class CartError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra; // e.g. { code, availableQuantity }
  }
}

/**
 * Decides whether `quantity` of a product can be bought right now
 * (docs/07 §23: product exists + active, brand active, product available,
 * quantity within stock). Pure function, shared by every cart write and by
 * the cart read (which flags stale lines instead of failing).
 *
 * Returns null when OK, else { code, availableQuantity? }.
 * No inventory record = nothing to sell = OUT_OF_STOCK (same rule as the
 * public availability state). Untracked products have no stock limit.
 */
function evaluateLine({ product, brand, inventory, quantity }) {
  if (!product || product.status !== 'ACTIVE' || product.isActive !== true) {
    return { code: 'PRODUCT_UNAVAILABLE' };
  }
  if (!brand || brand.status !== 'ACTIVE') {
    return { code: 'BRAND_UNAVAILABLE' };
  }
  if (inventory && inventory.trackInventory === false) {
    return null;
  }
  const available = inventory ? inventory.availableQuantity : 0;
  if (available <= 0) {
    return { code: 'OUT_OF_STOCK' };
  }
  if (quantity > available) {
    return { code: 'INSUFFICIENT_STOCK', availableQuantity: available };
  }
  return null;
}

const MESSAGES = {
  PRODUCT_UNAVAILABLE: [404, 'Product not found.'],
  BRAND_UNAVAILABLE: [404, 'Product not found.'],
  OUT_OF_STOCK: [409, 'This product is out of stock.'],
  INSUFFICIENT_STOCK: [409, 'Not enough stock available for that quantity.'],
};

function assertPurchasable(context) {
  const problem = evaluateLine(context);
  if (problem) {
    const [status, message] = MESSAGES[problem.code];
    throw new CartError(status, message, problem);
  }
}

async function loadPurchasable(productId) {
  const product = await Product.findById(productId);
  if (!product) {
    throw new CartError(404, 'Product not found.', { code: 'PRODUCT_UNAVAILABLE' });
  }
  const [brand, inventory] = await Promise.all([
    Brand.findById(product.brandId),
    Inventory.findOne({ productId: product._id }),
  ]);
  return { product, brand, inventory };
}

// Money in integer cents so 0.1 + 0.2 style float errors can't creep in.
const toCents = (price) => Math.round(price * 100);
const fromCents = (cents) => cents / 100;

async function getOrCreateCart(userId) {
  try {
    return await Cart.findOneAndUpdate(
      { userId },
      { $setOnInsert: { items: [] } },
      { upsert: true, new: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      return Cart.findOne({ userId });
    }
    throw err;
  }
}

/**
 * Cart view: lines grouped by brand, with CURRENT prices resolved from the
 * database (never stored in the cart). Stale lines (product deactivated,
 * brand suspended, stock dropped) are flagged with an `issue` and excluded
 * from totals rather than failing the whole request; checkout re-validates.
 *
 * Only pricing for display — delivery/charges/discounts are not defined
 * yet (docs/07 §25) and arrive with checkout.
 */
async function getCartView(userId) {
  const cart = await Cart.findOne({ userId });
  const lines = cart ? cart.items : [];
  if (lines.length === 0) {
    return { groups: [], subtotal: 0, itemCount: 0, hasIssues: false };
  }

  const productIds = lines.map((l) => l.productId);
  const brandIds = [...new Set(lines.map((l) => String(l.brandId)))];
  const [products, brands, inventories] = await Promise.all([
    Product.find({ _id: { $in: productIds } }),
    Brand.find({ _id: { $in: brandIds } }),
    Inventory.find({ productId: { $in: productIds } }),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const brandById = new Map(brands.map((b) => [String(b._id), b]));
  const inventoryByProduct = new Map(inventories.map((i) => [String(i.productId), i]));

  const groups = new Map();
  let subtotalCents = 0;
  let itemCount = 0;
  let hasIssues = false;

  lines.forEach((line) => {
    const product = productById.get(String(line.productId));
    const brand = brandById.get(String(line.brandId));
    const problem = evaluateLine({
      product,
      brand,
      inventory: inventoryByProduct.get(String(line.productId)),
      quantity: line.quantity,
    });

    const unitPriceCents = product ? toCents(product.price) : 0;
    const lineCents = problem ? 0 : unitPriceCents * line.quantity;
    if (problem) {
      hasIssues = true;
    } else {
      subtotalCents += lineCents;
      itemCount += line.quantity;
    }

    const key = String(line.brandId);
    if (!groups.has(key)) {
      groups.set(key, {
        brand: brand ? { _id: brand._id, name: brand.name, slug: brand.slug, logo: brand.logo } : { _id: line.brandId },
        items: [],
        subtotalCents: 0,
      });
    }
    const group = groups.get(key);
    group.subtotalCents += lineCents;
    group.items.push({
      productId: line.productId,
      name: product ? product.name : null,
      slug: product ? product.slug : null,
      image: product && product.images && product.images.length ? product.images[0] : null,
      unitPrice: product ? product.price : null,
      quantity: line.quantity,
      lineTotal: fromCents(lineCents),
      issue: problem ? problem.code : null,
      // Exact stock is only revealed when the customer must fix a quantity.
      ...(problem && problem.availableQuantity !== undefined && {
        availableQuantity: problem.availableQuantity,
      }),
    });
  });

  return {
    groups: [...groups.values()].map(({ subtotalCents: c, ...g }) => ({ ...g, subtotal: fromCents(c) })),
    subtotal: fromCents(subtotalCents),
    itemCount,
    hasIssues,
  };
}

/**
 * Adds a product (or increases its quantity if already in the cart).
 * brandId comes from the product, never the client. The stock check uses
 * existing + requested quantity; the quantity cap is enforced atomically in
 * the update filter. The cart is NOT a reservation — checkout re-validates
 * and reserves (docs/07 §20).
 */
async function addItem(userId, { productId, quantity }) {
  const context = await loadPurchasable(productId);
  const { product } = context;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const cart = await getOrCreateCart(userId);
    const existing = cart.items.find((i) => String(i.productId) === String(product._id));
    const total = (existing ? existing.quantity : 0) + quantity;

    if (total > MAX_ITEM_QUANTITY) {
      throw new CartError(409, `You can buy at most ${MAX_ITEM_QUANTITY} of one product.`, {
        code: 'QUANTITY_LIMIT',
      });
    }
    assertPurchasable({ ...context, quantity: total });

    let result;
    if (existing) {
      result = await Cart.updateOne(
        {
          userId,
          items: {
            $elemMatch: { productId: product._id, quantity: { $lte: MAX_ITEM_QUANTITY - quantity } },
          },
        },
        { $inc: { 'items.$.quantity': quantity } }
      );
    } else {
      if (cart.items.length >= MAX_CART_LINES) {
        throw new CartError(409, `Your cart can hold at most ${MAX_CART_LINES} different products.`, {
          code: 'CART_FULL',
        });
      }
      result = await Cart.updateOne(
        { userId, 'items.productId': { $ne: product._id } },
        { $push: { items: { productId: product._id, brandId: product.brandId, quantity } } }
      );
    }

    if (result.modifiedCount === 1) {
      return getCartView(userId);
    }
    // 0 modified: the cart changed between read and write. Re-read and retry.
  }
  throw new CartError(409, 'Your cart was modified by another request. Please retry.', {
    code: 'CART_CONFLICT',
  });
}

async function updateItem(userId, productId, { quantity }) {
  const cart = await Cart.findOne({ userId });
  const inCart = cart && cart.items.some((i) => String(i.productId) === String(productId));
  if (!inCart) {
    throw new CartError(404, 'Item not found in cart.', { code: 'NOT_IN_CART' });
  }

  assertPurchasable({ ...(await loadPurchasable(productId)), quantity });

  const result = await Cart.updateOne(
    { userId, 'items.productId': productId },
    { $set: { 'items.$.quantity': quantity } }
  );
  if (result.matchedCount === 0) {
    throw new CartError(404, 'Item not found in cart.', { code: 'NOT_IN_CART' });
  }
  return getCartView(userId);
}

// Removing never needs product/stock validation, so a deactivated product
// can always be removed from the cart.
async function removeItem(userId, productId) {
  const result = await Cart.updateOne(
    { userId, 'items.productId': productId },
    { $pull: { items: { productId } } }
  );
  if (result.matchedCount === 0) {
    throw new CartError(404, 'Item not found in cart.', { code: 'NOT_IN_CART' });
  }
  return getCartView(userId);
}

async function clearCart(userId) {
  await Cart.updateOne({ userId }, { $set: { items: [] } });
  return getCartView(userId);
}

module.exports = {
  getCartView,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  evaluateLine,
  CartError,
  MAX_CART_LINES,
};
