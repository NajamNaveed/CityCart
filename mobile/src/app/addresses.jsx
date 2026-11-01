import { useCallback, useState } from 'react'
import { Alert, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../components/ui/AppText'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import BackButton from '../components/BackButton'
import RequireCustomer from '../components/RequireCustomer'
import { useAuth } from '../hooks/useAuth'
import { useRemote } from '../hooks/useRemote'
import { getErrorMessage } from '../services/api'
import { deleteAddress, fetchAddresses, setDefaultAddress } from '../services/addresses'
import { colors, radius, spacing } from '../theme'

// The customer's saved delivery addresses. New ones are saved from checkout, where the pin is
// chosen on the map; here they can be made the default or deleted.
function AddressList() {
  const { status, user } = useAuth()
  const remote = useRemote(`addresses:${status === 'signedIn' ? user.id : 'none'}`, fetchAddresses)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const { reload } = remote

  const run = useCallback(
    async (action) => {
      setBusy(true)
      setNotice('')
      try {
        await action()
        reload()
      } catch (err) {
        setNotice(getErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  const confirmDelete = (address) =>
    Alert.alert(`Delete “${address.label}”?`, 'Orders you have already placed keep the address they were sent to.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => deleteAddress(address._id)) },
    ])

  if (remote.status === 'loading') return <Skeleton height={120} />
  if (remote.status === 'error') return <EmptyState icon="wifi-off" tone="error" title="Couldn't load your addresses" message={remote.error} action={<Button title="Try again" onPress={remote.reload} />} />
  if (remote.data.length === 0) {
    return <EmptyState icon="map-pin" title="No saved addresses yet" message="Tick “Save this address” when you check out and it will be here next time." />
  }

  return (
    <View style={{ gap: spacing.md }}>
      {notice ? (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="small" style={{ color: colors.danger }}>
            {notice}
          </AppText>
        </View>
      ) : null}
      {remote.data.map((a) => (
        <Card key={a._id} style={{ gap: spacing.sm }}>
          <AppText variant="strong">
            {a.label}
            {a.isDefault ? <AppText variant="small">{'  Default'}</AppText> : null}
          </AppText>
          <AppText variant="small">
            {a.fullName} · {a.phone}
          </AppText>
          <AppText variant="small">
            {a.addressLine}, {a.city}
          </AppText>
          {a.blocks.length > 0 ? (
            <AppText variant="small" style={{ color: colors.clay }}>
              {a.blocks.map((b) => b.name).join(' + ')}
            </AppText>
          ) : (
            <AppText variant="small" style={{ color: colors.danger }}>
              We no longer deliver to this spot.
            </AppText>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {!a.isDefault ? <Button title="Make default" variant="outline" disabled={busy} onPress={() => run(() => setDefaultAddress(a._id))} /> : null}
            <Button title="Delete" variant="outline" disabled={busy} onPress={() => confirmDelete(a)} />
          </View>
        </Card>
      ))}
    </View>
  )
}

export default function Addresses() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Saved addresses
        </AppText>
      </View>
      <View style={{ flex: 1, padding: spacing.lg }}>
        <RequireCustomer next="/addresses" icon="map-pin" title="Sign in to see your addresses" message="Saved addresses belong to your account.">
          <AddressList />
        </RequireCustomer>
      </View>
    </SafeAreaView>
  )
}
