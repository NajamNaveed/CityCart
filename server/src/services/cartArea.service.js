const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const Branch = require('../models/branch.model');

/**
 * "If I shop here instead, which of my cart items can still be delivered?"
 * (docs/22 §A). Used when the customer changes shopping area with items in the cart.
 *
 * An item can be delivered when its store has an active shop whose zone holds one of
 * the chosen blocks. Nothing is changed: the app shows the result and the customer
 * confirms removing the items that cannot be delivered.
 */
async function checkCartArea(userId, blockIds) {
  const cart = await Cart.findOne({ userId });
  if (!cart || cart.items.length === 0) {
    return { deliverable: [], undeliverable: [] };
  }

  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } });
  const brandIds = [...new Set(products.map((p) => String(p.brandId)))];
  const [serving, brands] = await Promise.all([
    Branch.find({ brandId: { $in: brandIds }, isActive: true, blockIds: { $in: blockIds } }),
    Brand.find({ _id: { $in: brandIds } }),
  ]);
  const served = new Set(serving.map((b) => String(b.brandId)));
  const brandName = new Map(brands.map((b) => [String(b._id), b.name]));
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const deliverable = [];
  const undeliverable = [];
  for (const item of cart.items) {
    const product = productById.get(String(item.productId));
    if (product && served.has(String(product.brandId))) {
      deliverable.push(String(item.productId));
    } else {
      undeliverable.push({
        productId: String(item.productId),
        name: product ? product.name : null,
        brandName: product ? brandName.get(String(product.brandId)) || null : null,
      });
    }
  }
  return { deliverable, undeliverable };
}

module.exports = { checkCartArea };
