import { useEffect, useState } from 'react'
import api from '../services/api'

// Public ACTIVE brands, optionally limited to one city.
export function useBrands(cityId) {
  const [state, setState] = useState({ key: null, brands: [] })
  const key = cityId || 'all'

  useEffect(() => {
    let active = true
    api
      .get('/brands', { params: cityId ? { cityId } : {} })
      .then((res) => active && setState({ key, brands: res.data.brands }))
      .catch(() => active && setState({ key, brands: [] }))
    return () => {
      active = false
    }
  }, [cityId, key])

  return { brands: state.brands, loading: state.key !== key }
}