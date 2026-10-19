import api from './api'

// The cart lives on the server (one per customer); these return the server's fresh cart every time.
// A cart is { groups: [{ brand: { _id, name }, items: [...], subtotal }], itemCount, subtotal }.
export const MAX_PRODUCT_QTY = 10 // most the product page adds at once (same as the web)
export const MAX_CART_QTY = 99 // most one line in the cart can hold

export async function fetchCart() {
  const res = await api.get('/cart')
  return res.data.cart
}

export async function addToCart(productId, quantity = 1) {
  const res = await api.post('/cart/items', { productId, quantity })
  return res.data.cart
}

export async function setCartQuantity(productId, quantity) {
  const res = await api.patch(`/cart/items/${productId}`, { quantity })
  return res.data.cart
}

export async function removeFromCart(productId) {
  const res = await api.delete(`/cart/items/${productId}`)
  return res.data.cart
}

const ISSUES = {
  PRODUCT_UNAVAILABLE: 'No longer available',
  BRAND_UNAVAILABLE: 'This brand is unavailable',
  OUT_OF_STOCK: 'Out of stock',
}

// Why a cart line cannot be ordered, or '' when it can.
export function issueText(item) {
  if (!item?.issue) return ''
  return item.issue === 'INSUFFICIENT_STOCK' ? `Only ${item.availableQuantity} available` : ISSUES[item.issue] || 'Unavailable'
}

export const cartHasIssues = (cart) => Boolean(cart?.groups?.some((group) => group.items.some((item) => item.issue)))
export const cartIsEmpty = (cart) => !cart || !cart.groups || cart.groups.length === 0

// Keeps a quantity inside what a line may hold.
export const clampQuantity = (value, max = MAX_CART_QTY) => Math.min(max, Math.max(1, Math.floor(Number(value)) || 1))
