import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
// Each weight is imported on its own. The packages' main entry lists every
// weight and italic, and importing from it would put all of them in the app.
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular'
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium'
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold'
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold'
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold'
import { AuthProvider } from '../context/AuthProvider'
import { CityProvider } from '../context/CityProvider'
import { useAuth } from '../hooks/useAuth'
import { colors } from '../theme'

// Keep the splash screen up until the fonts are loaded and we know whether a
// saved login is still good, so the app never flashes the wrong screen.
SplashScreen.preventAutoHideAsync()

function Shell({ fontsReady }) {
  const { isReady } = useAuth()
  const ready = fontsReady && isReady

  useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Fraunces_600SemiBold,
  })

  return (
    <AuthProvider>
      <CityProvider>
        {/* If a font fails to load the app still opens, with the system font. */}
        <Shell fontsReady={fontsLoaded || Boolean(fontError)} />
      </CityProvider>
    </AuthProvider>
  )
}
