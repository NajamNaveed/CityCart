import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { spacing } from '../../theme'

// The records screens (orders, deliveries, receipts, cash hand-over) are built in
// the next phase (docs/20 §6.3). Until then a team member can sign in and out.
export default function Records() {
  const { user, logout } = useAuth()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <Screen title="Records">
        <Card style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
          <AppText variant="strong">{user?.name}</AppText>
          <AppText variant="small">
            The records screens for orders, deliveries, receipts and cash are coming in the next update. For now, use the CityCart website.
          </AppText>
        </Card>
        <Button title="Sign out" variant="outline" onPress={logout} />
      </Screen>
    </RequireRole>
  )
}
