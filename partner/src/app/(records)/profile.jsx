import { View } from 'react-native'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { visibleTabs } from '../../utils/permissions'
import { spacing } from '../../theme'

export default function Profile() {
  const { user, logout } = useAuth()
  const show = visibleTabs(user)
  const access = [show.orders && 'Orders', show.shipments && 'Deliveries', show.money && 'Money'].filter(Boolean)
  return (
    <Screen title="Account">
      <Card style={{ gap: spacing.xs, marginBottom: spacing.xl }}>
        <AppText variant="strong">{user?.name}</AppText>
        <AppText variant="small">{user?.email}</AppText>
        <AppText variant="small">Brand team</AppText>
        <AppText variant="small">{access.length ? `You can see: ${access.join(', ')}.` : 'Your brand has not given you access to anything yet.'}</AppText>
      </Card>
      <View style={{ gap: spacing.md }}>
        <Button title="Sign out" variant="outline" onPress={logout} />
        <AppText variant="small" style={{ textAlign: 'center' }}>
          Your sign-in lasts one shift. Brand owners manage permissions on the website.
        </AppText>
      </View>
    </Screen>
  )
}
