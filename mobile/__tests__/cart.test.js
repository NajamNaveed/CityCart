jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }))

import api from '../src/services/api'
import { addToCart, cartHasIssues, cartIsEmpty, clampQuantity, fetchCart, issueText, MAX_CART_QTY, removeFromCart, setCartQuantity } from '../src/services/cart'

beforeEach(() => jest.clearAllMocks())

describe('cart requests', () => {
  const cart = { groups: [], itemCount: 0, subtotal: 0 }

  it('read and change the server cart, always returning the fresh cart', async () => {
    api.get.mockResolvedValue({ data: { cart } })
    api.post.mockResolvedValue({ data: { cart: { ...cart, itemCount: 2 } } })
    api.patch.mockResolvedValue({ data: { cart: { ...cart, itemCount: 3 } } })
    api.delete.mockResolvedValue({ data: { cart: { ...cart, itemCount: 1 } } })

    expect(await fetchCart()).toEqual(cart)
    expect((await addToCart('p1', 2)).itemCount).toBe(2)
    expect(api.post).toHaveBeenCalledWith('/cart/items', { productId: 'p1', quantity: 2 })
    expect((await setCartQuantity('p1', 3)).itemCount).toBe(3)
    expect(api.patch).toHaveBeenCalledWith('/cart/items/p1', { quantity: 3 })
    expect((await removeFromCart('p1')).itemCount).toBe(1)
    expect(api.delete).toHaveBeenCalledWith('/cart/items/p1')
  })

  it('adds one by default', async () => {
    api.post.mockResolvedValue({ data: { cart } })
    await addToCart('p1')
    expect(api.post).toHaveBeenCalledWith('/cart/items', { productId: 'p1', quantity: 1 })
  })
})

describe('issueText', () => {
  it('says why a line cannot be ordered', () => {
    expect(issueText({ issue: 'OUT_OF_STOCK' })).toBe('Out of stock')
    expect(issueText({ issue: 'PRODUCT_UNAVAILABLE' })).toBe('No longer available')
    expect(issueText({ issue: 'BRAND_UNAVAILABLE' })).toBe('This brand is unavailable')
    expect(issueText({ issue: 'INSUFFICIENT_STOCK', availableQuantity: 3 })).toBe('Only 3 available')
    expect(issueText({ issue: 'SOMETHING_NEW' })).toBe('Unavailable')
  })
  it('says nothing for a line that is fine', () => {
    expect(issueText({})).toBe('')
    expect(issueText(undefined)).toBe('')
  })
})

describe('cart helpers', () => {
  const group = (items) => ({ brand: { _id: 'b1', name: 'Loom' }, items, subtotal: 0 })

  it('notices a cart with a line that cannot be ordered', () => {
    expect(cartHasIssues({ groups: [group([{ productId: 'a' }, { productId: 'b', issue: 'OUT_OF_STOCK' }])] })).toBe(true)
    expect(cartHasIssues({ groups: [group([{ productId: 'a' }])] })).toBe(false)
    expect(cartHasIssues(null)).toBe(false)
  })

  it('knows when the cart is empty', () => {
    expect(cartIsEmpty(null)).toBe(true)
    expect(cartIsEmpty({ groups: [] })).toBe(true)
    expect(cartIsEmpty({ groups: [group([])] })).toBe(false)
  })

  it('keeps a quantity between 1 and the limit', () => {
    expect(clampQuantity(0)).toBe(1)
    expect(clampQuantity(-5)).toBe(1)
    expect(clampQuantity('abc')).toBe(1)
    expect(clampQuantity(3.7)).toBe(3)
    expect(clampQuantity(500)).toBe(MAX_CART_QTY)
    expect(clampQuantity(15, 10)).toBe(10)
  })
})
