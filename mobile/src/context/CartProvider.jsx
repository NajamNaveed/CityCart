import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { addToCart, fetchCart } from '../services/cart'
import { CartContext } from './contexts'

/**
 * The number on the Cart tab. Only customers have a cart; everyone else always
 * sees 0. The count is only a badge: the cart itself is always read from the server.
 */
export function CartProvider({ children }) {
  const { user } = useAuth()
  const isCustomer = user?.role === 'CUSTOMER'
  const userId = user?.id
  const [loaded, setLoaded] = useState({ userId: null, count: 0 })

  useEffect(() => {
    if (!isCustomer) return undefined
    let active = true
    fetchCart()
      // Number() guards against an odd answer: the badge stays at zero instead of breaking.
      .then((cart) => active && setLoaded({ userId, count: Number(cart?.itemCount) || 0 }))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isCustomer, userId])

  const setCount = useCallback((count) => setLoaded({ userId, count: Number(count) || 0 }), [userId])

  const addItem = useCallback(
    async (productId, quantity = 1) => {
      const cart = await addToCart(productId, quantity)
      setLoaded({ userId, count: Number(cart.itemCount) || 0 })
      return cart
    },
    [userId],
  )

  // Another account's count is never shown, even for a moment after switching users.
  const itemCount = isCustomer && loaded.userId === userId ? loaded.count : 0
  const value = useMemo(() => ({ itemCount, addItem, setCount }), [itemCount, addItem, setCount])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
