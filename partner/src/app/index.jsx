import { Redirect } from 'expo-router'
import { useAuth } from '../hooks/useAuth'

// The start screen only decides where each person belongs: the sign-in, the
// rider's deliveries, or the records screens of a brand team member.
export default function Start() {
  const { status, user } = useAuth()
  if (status === 'loading') return null
  if (status !== 'signedIn') return <Redirect href="/login" />
  return <Redirect href={user?.role === 'RIDER' ? '/deliveries' : '/records'} />
}
