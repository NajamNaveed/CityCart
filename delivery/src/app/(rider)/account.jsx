import { useEffect, useState } from 'react'
import { Switch, View } from 'react-native'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Screen from '../../components/ui/Screen'
import { useAuth } from '../../hooks/useAuth'
import { ensureLocationPermission, stopSharingOnServer } from '../../services/location'
import { getShareLocation, loadPrefs, setShareLocation } from '../../services/prefs'
import { colors, spacing } from '../../theme'

export default function Account() {
  const { user, logout } = useAuth()
  const [sharing, setSharing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    loadPrefs().then(() => active && setSharing(getShareLocation()))
    return () => {
      active = false
    }
  }, [])

  async function toggle(next) {
    setMessage('')
    if (next && !(await ensureLocationPermission())) {
      setMessage('Location is turned off for this app. Turn it on in your phone settings, then try again.')
      return
    }
    await setShareLocation(next)
    setSharing(next)
    if (!next) stopSharingOnServer()
  }

  return (
    <Screen title="Account">
      <Card style={{ gap: spacing.xs, marginBottom: spacing.xl }}>
        <AppText variant="strong">{user?.name}</AppText>
        <AppText variant="small">{user?.email}</AppText>
        {user?.phone ? <AppText variant="small">{user.phone}</AppText> : null}
        <AppText variant="small">Delivery rider</AppText>
      </Card>

      <Card style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="strong" style={{ flex: 1 }}>
            Share my location while I deliver
          </AppText>
          <Switch
            value={sharing}
            onValueChange={toggle}
            accessibilityLabel="Share my location while I deliver"
            trackColor={{ true: colors.pine, false: colors.line }}
          />
        </View>
        <AppText variant="small">
          Off unless you turn it on. While an order is out for delivery, that order&apos;s customer and your brand can see where you are. Only your latest position is kept, and it works only while this app is open.
        </AppText>
        {message ? (
          <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
            {message}
          </AppText>
        ) : null}
      </Card>

      <View style={{ gap: spacing.md }}>
        <Button title="Sign out" variant="outline" onPress={() => logout()} />
        <AppText variant="small" style={{ textAlign: 'center' }}>
          Your sign-in lasts one shift. If you are signed out, sign in again.
        </AppText>
      </View>
    </Screen>
  )
}
