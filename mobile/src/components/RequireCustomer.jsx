import { View } from 'react-native'
import { useRouter } from 'expo-router'
import AppText from './ui/AppText'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { loginHref, registerHref } from '../utils/nav'
import { spacing } from '../theme'

/**
 * Shows its children to a signed-in shopper, and otherwise a friendly "sign in to
 * continue" that brings them straight back here afterwards (`next`).
 * It renders no frame of its own: the screen wraps it.
 */
export default function RequireCustomer({ next, icon = 'user', title = 'Sign in to continue', message, children }) {
  const router = useRouter()
  const { status, user } = useAuth()

  if (status === 'signedIn' && user?.role === 'CUSTOMER') return children
  if (status === 'signedIn') {
    return <EmptyState icon="user-x" title="This is for shoppers" message="Seller and admin accounts use the CityCart website." />
  }
  return (
    <EmptyState
      icon={icon}
      title={title}
      message={message}
      action={
        <View style={{ gap: spacing.md }}>
          <Button title="Sign in" onPress={() => router.push(loginHref(next))} />
          <Button title="Create an account" variant="outline" onPress={() => router.push(registerHref(next))} />
          <AppText variant="small" style={{ textAlign: 'center' }}>
            It only takes a minute.
          </AppText>
        </View>
      }
    />
  )
}
