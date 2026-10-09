import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { CartContext } from './contexts'

// Only customers have a cart; everyone else always sees a count of 0.
export function CartProvider({ children }) {
  const { user } = useAuth()
  const isCustomer = user?.role === 'CUSTOMER'
  const [loadedCount, setLoadedCount] = useState(0)

  useEffect(() => {
    if (!isCustomer) return undefined
    let active = true
    api
      .get('/cart')
      // Number check guards a misconfigured deployment answering with the
      // SPA page — the badge just stays at zero instead of crashing.
      .then((res) => active && setLoadedCount(Number(res.data?.cart?.itemCount) || 0))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isCustomer])

  const addItem = useCallback(async (productId, quantity = 1) => {
    const res = await api.post('/cart/items', { productId, quantity })
    setLoadedCount(res.data.cart.itemCount)
    return res.data.cart
  }, [])

  const setCount = useCallback((n) => setLoadedCount(n), [])

  const value = useMemo(
    () => ({ itemCount: isCustomer ? loadedCount : 0, addItem, setCount }),
    [isCustomer, loadedCount, addItem, setCount],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}