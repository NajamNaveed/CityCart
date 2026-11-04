import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider } from '../context/AuthProvider'
import OfflineBanner from '../components/OfflineBanner'
import { useAuth } from '../hooks/useAuth'
import { destinationFor, listenForNotificationTaps, registerForPush } from '../services/push'
import { colors } from '../theme'

// Keep the splash screen up until we know whether a saved sign-in is still
// good, so the app never flashes the wrong screen.
SplashScreen.preventAutoHideAsync()

// Once someone is signed in: this phone asks to receive their notifications, and a tap on one opens
// the right screen. Does nothing where push cannot work (Expo Go, no project id): see services/push.js.
function PushSetup() {
  const { status, user } = useAuth()
  const router = useRouter()
  const role = user?.role

  useEffect(() => {
    if (status !== 'signedIn') return undefined
    registerForPush()
    let stop = () => {}
    let cancelled = false
    listenForNotificationTaps((data) => {
      const to = destinationFor(role, data)
      if (to) router.push(to)
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe()
      else stop = unsubscribe
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [status, role, router])

  return null
}

function Shell() {
  const { isReady } = useAuth()

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync()
  }, [isReady])

  if (!isReady) return null
  return (
    <>
      <StatusBar style="dark" />
      <OfflineBanner />
      <PushSetup />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
    </>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
