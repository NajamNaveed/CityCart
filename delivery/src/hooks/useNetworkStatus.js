import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

// True only when the OS reports the device as disconnected, so the banner
// never flashes on launch or on the brief gaps while NetInfo's first event
// arrives. `isInternetReachable` is deliberately ignored: it needs a probe
// request and is unreliable on some networks, and a connected-but-broken
// network already surfaces as request errors on each screen.
export function useNetworkStatus() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false)
    })
    return unsubscribe
  }, [])

  return offline
}
