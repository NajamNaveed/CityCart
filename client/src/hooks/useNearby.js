import { useContext } from 'react'
import { NearbyContext } from '../context/contexts'

export function useNearby() {
  const ctx = useContext(NearbyContext)
  if (!ctx) throw new Error('useNearby must be used inside <NearbyProvider>')
  return ctx
}
