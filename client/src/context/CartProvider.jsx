import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { CartContext } from './contexts'

// Only customers have a cart; everyone else always sees a count of 0.
// The full cart view (lines, subtotal) is kept here too so the cart tray and
// shelf steppers can read quantities without fetching /cart again.
export function CartProvider({ children }) {
  const { user } = useAuth()
  const isCustomer = user?.role === 'CUSTOMER'
  const [cart, setCart] = useState(null)
  // The product currently flying between the shelf and the tray. Display only:
  // the cart itself always comes from the server. The tray keeps a slot open
  // for it, so the photo lands on an exact place instead of a guessed one.
  const [flight, setFlight] = useState(null)

  // Every cart change arrives as the server's fresh view. Pages that call the
  // API themselves (Cart, Checkout) hand it back the same way, so the shelf
  // steppers and the tray can never disagree with the bag.
  const sync = useCallback((next) => {
    setCart(next && typeof next === 'object' ? next : null)
    setFlight(null)
  }, [])

  useEffect(() => {
    if (!isCustomer) return undefined
    let active = true
    api
      .get('/cart')
      // The shape check guards a misconfigured deployment answering with the
      // SPA page — the badge then just stays at zero instead of crashing.
      .then((res) => active && sync(res.data?.cart))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isCustomer, sync])

  // `hint` is the shelf's own product record. Nothing trusted comes from it —
  // it only paints the slot while the server answer is still on its way, and
  // its image is the photo URL the tile already downloaded.
  const addItem = useCallback(
    async (productId, quantity = 1, hint) => {
      setFlight({ productId, direction: 'in', name: hint?.name || '', image: hint?.image || '' })
      try {
        const res = await api.post('/cart/items', { productId, quantity })
        sync(res.data.cart)
        return res.data.cart
      } finally {
        setFlight(null)
      }
    },
    [sync],
  )

  const updateItem = useCallback(
    async (productId, quantity) => {
      const res = await api.patch(`/cart/items/${productId}`, { quantity })
      sync(res.data.cart)
      return res.data.cart
    },
    [sync],
  )

  const removeItem = useCallback(
    async (productId) => {
      // Dim the tray thumb straight away; the reverse flight reads as the item
      // leaving the bag even before the server confirms it.
      setFlight({ productId, direction: 'out' })
      try {
        const res = await api.delete(`/cart/items/${productId}`)
        sync(res.data.cart)
        return res.data.cart
      } finally {
        setFlight(null)
      }
    },
    [sync],
  )

  const itemCount = isCustomer ? Number(cart?.itemCount) || 0 : 0
  const subtotal = isCustomer ? Number(cart?.subtotal) || 0 : 0

  // Every line, in bag order, for the tray's thumbnail rail.
  const lines = useMemo(() => {
    const items = []
    if (!isCustomer) return items
    for (const group of cart?.groups || []) {
      for (const line of group.items || []) items.push(line)
    }
    return items
  }, [cart, isCustomer])

  const quantities = useMemo(() => {
    const map = new Map()
    for (const line of lines) map.set(String(line.productId), line.quantity)
    return map
  }, [lines])

  const value = useMemo(
    () => ({
      isCustomer,
      itemCount,
      subtotal,
      lines,
      flight,
      quantityFor: (productId) => quantities.get(String(productId)) || 0,
      addItem,
      updateItem,
      removeItem,
      sync,
    }),
    [isCustomer, itemCount, subtotal, lines, flight, quantities, addItem, updateItem, removeItem, sync],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
