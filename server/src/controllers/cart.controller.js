const {
  addItemSchema,
  updateItemSchema,
  productIdParamSchema,
} = require('../validators/cart.validator');
const {
  getCartView,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  CartError,
} = require('../services/cart.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: formatZodError(error),
  });
}

function handleError(err, res, next) {
  if (err instanceof CartError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

// The cart is always the authenticated customer's own (req.user._id) —
// there is no userId in any URL or body, so there is nothing to tamper with.
async function get(req, res, next) {
  try {
    return res.status(200).json({ success: true, cart: await getCartView(req.user._id) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function add(req, res, next) {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const cart = await addItem(req.user._id, parsed.data);
    return res.status(200).json({ success: true, message: 'Item added to cart', cart });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = productIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateItemSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const cart = await updateItem(req.user._id, params.data.productId, body.data);
    return res.status(200).json({ success: true, message: 'Cart updated', cart });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function remove(req, res, next) {
  const params = productIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const cart = await removeItem(req.user._id, params.data.productId);
    return res.status(200).json({ success: true, message: 'Item removed', cart });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function clear(req, res, next) {
  try {
    const cart = await clearCart(req.user._id);
    return res.status(200).json({ success: true, message: 'Cart cleared', cart });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { get, add, update, remove, clear };
