import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { spacing } from '../../theme'

export default function Account() {
  const { status, user, offline, logout, retry } = useAuth()

  if (status === 'signedIn' && user) {
    return (
      <Screen title="Account">
        <Card>
          <AppText variant="strong">{user.name}</AppText>
          <AppText variant="small">{user.email}</AppText>
        </Card>
        <Button title="Sign out" variant="outline" onPress={logout} style={{ marginTop: spacing.lg }} />
      </Screen>
    )
  }

  return (
    <Screen title="Account">
      {offline ? (
        <EmptyState
          icon="wifi-off"
          tone="error"
          title="Can't reach the server"
          message="You may still be signed in. Check your connection and try again."
          action={<Button title="Try again" onPress={retry} />}
        />
      ) : (
        <EmptyState icon="user" title="Sign in comes next" message="Login and registration arrive in Phase 2." />
      )}
    </Screen>
  )
}
