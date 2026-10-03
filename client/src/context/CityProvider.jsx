import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { CityContext } from './contexts'

const STORAGE_KEY = 'citycart.cityId'

function readStoredCity() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

// Holds the active cities and the visitor's chosen city ('' = all cities).
export function CityProvider({ children }) {
  const [cities, setCities] = useState([])
  const [stored, setStored] = useState(readStoredCity)

  useEffect(() => {
    let active = true
    api
      .get('/cities', { params: { isActive: true } })
      .then((res) => active && setCities(res.data.cities))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // A remembered city that no longer exists falls back to "all cities".
  const cityId = cities.some((c) => c._id === stored) ? stored : ''

  const setCityId = useCallback((id) => {
    setStored(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* private mode: the choice just won't persist */
    }
  }, [])

  const city = cities.find((c) => c._id === cityId) || null
  const value = useMemo(() => ({ cities, city, cityId, setCityId }), [cities, city, cityId, setCityId])

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>
}