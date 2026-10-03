import { useContext } from 'react'
import { CityContext } from '../context/contexts'

export function useCity() {
  const ctx = useContext(CityContext)
  if (!ctx) throw new Error('useCity must be used inside <CityProvider>')
  return ctx
}