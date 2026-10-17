import { useContext } from 'react'
import { NearbyContext } from '../context/contexts'

// const { block, blockId, coords, range, status, detect, chooseBlock, setRange, ... } = useNearby()
export function useNearby() {
  const context = useContext(NearbyContext)
  if (!context) throw new Error('useNearby must be used inside <NearbyProvider>')
  return context
}
