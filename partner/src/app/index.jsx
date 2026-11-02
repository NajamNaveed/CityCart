import { Redirect } from 'expo-router'
import { useAuth } from '../hooks/useAuth'

// The start screen only decides where each person belongs: the sign-in, the
// picker's queue, or a brand team member's records.
export default function Start() {
  const { status, user } = useAuth()
  if (status === 'loading') return null
  if (status !== 'signedIn') return <Redirect href="/login" />
  if (user?.role === 'PICKER') return <Redirect href="/queue" />
  return <Redirect href="/overview" />
}
