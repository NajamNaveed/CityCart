import { Alert, View } from 'react-native'
import { useRouter } from 'expo-router'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { spacing } from '../../theme'

export default function Account() {
  const router = useRouter()
  const { status, user, offline, logout, retry } = useAuth()

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again to order or chat with sellers.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ])

  if (status === 'signedIn' && user) {
    return (
      <Screen title="Account">
        <Card>
          <AppText variant="strong">{user.name}</AppText>
          <AppText variant="small">{user.email}</AppText>
        </Card>
        <AppText variant="small" style={{ marginTop: spacing.lg }}>
          Your orders and messages will appear here in the next phases.
        </AppText>
        <Button title="Sign out" variant="outline" onPress={confirmSignOut} style={{ marginTop: spacing.xl }} />
      </Screen>
    )
  }

  return (
    <Screen title="Account">
      {offline ? (
        <View style={{ marginBottom: spacing.lg }}>
          <EmptyState
            icon="wifi-off"
            tone="error"
            title="Can't reach the server"
            message="You may still be signed in. Check your connection and try again."
            action={<Button title="Try again" onPress={retry} />}
          />
        </View>
      ) : null}

      <Card>
        <AppText variant="heading" style={{ fontSize: 20 }}>
          Your city’s brands, one account.
        </AppText>
        <AppText variant="small" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
          Sign in to add to your cart, place orders and chat with sellers.
        </AppText>
        <Button title="Sign in" onPress={() => router.push('/login')} />
        <Button title="Create an account" variant="outline" onPress={() => router.push('/register')} style={{ marginTop: spacing.md }} />
      </Card>
    </Screen>
  )
}
