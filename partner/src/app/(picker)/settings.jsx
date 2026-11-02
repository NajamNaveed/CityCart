import { View } from 'react-native'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { colors, spacing } from '../../theme'

export default function PickerAccount() {
  const { user, logout } = useAuth()

  return (
    <Screen title="Account">
      <Card style={{ gap: spacing.xs, marginBottom: spacing.xl }}>
        <AppText variant="strong">{user?.name}</AppText>
        <AppText variant="small">{user?.email}</AppText>
        <AppText variant="small">Picker</AppText>
      </Card>

      <Card style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        <AppText variant="strong">What you can see</AppText>
        <AppText variant="small">
          The items and quantities to pick, never the customer&apos;s phone number, address or prices. If something is
          short, offer a substitute from your own store and the customer decides.
        </AppText>
      </Card>

      <View style={{ gap: spacing.md }}>
        <Button title="Sign out" variant="outline" onPress={() => logout()} />
        <AppText variant="small" style={{ textAlign: 'center', color: colors.muted }}>
          Your sign-in lasts one shift. If you are signed out, sign in again.
        </AppText>
      </View>
    </Screen>
  )
}
