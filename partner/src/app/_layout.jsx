import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider } from '../context/AuthProvider'
import OfflineBanner from '../components/OfflineBanner'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../theme'

// Keep the splash screen up until we know whether a saved sign-in is still
// good, so the app never flashes the wrong screen.
SplashScreen.preventAutoHideAsync()

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
