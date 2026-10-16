import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCities, resolveCityId } from '../services/cities'
import { prefs } from '../services/storage'
import { CityContext } from './contexts'

/**
 * The cities on offer and the shopper's choice ('' means all cities), remembered
 * on the phone. Browsing screens filter by it.
 */
export function CityProvider({ children }) {
  const [cities, setCities] = useState([])
  const [stored, setStored] = useState('')
  const [ready, setReady] = useState(false)

  // At start: the remembered choice and the list of cities.
  useEffect(() => {
    let active = true
    Promise.all([prefs.get('cityId', ''), fetchCities().catch(() => [])]).then(([savedId, list]) => {
      if (!active) return
      setStored(typeof savedId === 'string' ? savedId : '')
      setCities(list)
      setReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  const setCityId = useCallback((id) => {
    setStored(id)
    prefs.set('cityId', id)
  }, [])

  const cityId = resolveCityId(cities, stored)
  const city = cities.find((c) => c._id === cityId) || null
  const value = useMemo(() => ({ cities, city, cityId, setCityId, ready }), [cities, city, cityId, setCityId, ready])

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>
}
