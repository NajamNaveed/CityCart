import { useContext } from 'react'
import { CityContext } from '../context/contexts'

// const { cities, city, cityId, setCityId, ready } = useCity()   (cityId '' = all cities)
export function useCity() {
  const context = useContext(CityContext)
  if (!context) throw new Error('useCity must be used inside <CityProvider>')
  return context
}
