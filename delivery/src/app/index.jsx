import { Redirect } from 'expo-router'
import { useAuth } from '../hooks/useAuth'

// This app is for riders: signed out, the sign-in; signed in, the deliveries.
export default function Start() {
  const { status } = useAuth()
  if (status === 'loading') return null
  if (status !== 'signedIn') return <Redirect href="/login" />
  return <Redirect href="/deliveries" />
}
