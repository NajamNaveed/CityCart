import { View } from 'react-native'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { spacing } from '../../theme'

export default function Account() {
  const { user, logout } = useAuth()
  return (
    <Screen title="Account">
      <Card style={{ gap: spacing.xs, marginBottom: spacing.xl }}>
        <AppText variant="strong">{user?.name}</AppText>
        <AppText variant="small">{user?.email}</AppText>
        {user?.phone ? <AppText variant="small">{user.phone}</AppText> : null}
        <AppText variant="small">Delivery rider</AppText>
      </Card>
      <View style={{ gap: spacing.md }}>
        <Button title="Sign out" variant="outline" onPress={logout} />
        <AppText variant="small" style={{ textAlign: 'center' }}>
          Your sign-in lasts one shift. If you are signed out, sign in again.
        </AppText>
      </View>
    </Screen>
  )
}
