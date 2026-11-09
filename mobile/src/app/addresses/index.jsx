import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import BackButton from '../../components/BackButton'
import RequireCustomer from '../../components/RequireCustomer'
import { useAuth } from '../../hooks/useAuth'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { deleteAddress, fetchAddresses, makeDefaultAddress } from '../../services/addresses'
import { colors, radius, spacing } from '../../theme'

function Action({ label, tone = 'ink', disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={{
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: tone === 'danger' ? colors.danger : colors.line,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <AppText variant="label" style={{ color: tone === 'danger' ? colors.danger : colors.ink }}>
        {label}
      </AppText>
    </Pressable>
  )
}

function AddressCard({ address, busy, onEdit, onDefault, onDelete }) {
  return (
    <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="strong" style={{ flex: 1 }}>
          {address.label}
        </AppText>
        {address.isDefault ? (
          <View style={{ backgroundColor: colors.paper, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
            <AppText variant="small" style={{ textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>
              Default
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="small" style={{ color: colors.ink }}>
        {address.fullName} · {address.phone}
      </AppText>
      <AppText variant="small">
        {address.addressLine}, {address.city}
      </AppText>
      {address.blocks?.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Feather name="map-pin" size={13} color={colors.clay} />
          <AppText variant="small" style={{ color: colors.clay }}>
            {address.blocks.map((b) => b.name).join(' + ')}
          </AppText>
        </View>
      ) : (
        <AppText variant="small" style={{ color: colors.danger }}>
          We no longer deliver to this spot.
        </AppText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
        <Action label="Edit" disabled={busy} onPress={onEdit} />
        {!address.isDefault ? <Action label="Make default" disabled={busy} onPress={onDefault} /> : null}
        <Action label="Delete" tone="danger" disabled={busy} onPress={onDelete} />
      </View>
    </View>
  )
}

function AddressesList({ userId }) {
  const router = useRouter()
  const remote = useRemote(`addresses:${userId}`, fetchAddresses)
  const { reload } = remote
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const firstFocus = useRef(true)

  // Coming back from the form: show what was just saved.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      reload()
    }, [reload]),
  )

  async function run(action) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await action()
      remote.reload()
    } catch (err) {
      setMessage(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = (address) =>
    Alert.alert('Delete address?', `Delete “${address.label}”? Past orders keep the address they were sent to.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => deleteAddress(address._id)) },
    ])

  const list = remote.data || []

  return (
    <FlatList
      data={list}
      keyExtractor={(address) => address._id}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
          <AppText variant="small">
            Addresses you save here or at checkout appear in both places. Orders you have already placed keep the address they were sent to.
          </AppText>
          <Button title="Add address" onPress={() => router.push('/addresses/new')} />
          {message ? (
            <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
              <AppText variant="small" style={{ color: colors.danger }}>
                {message}
              </AppText>
            </View>
          ) : null}
          {busy ? <ActivityIndicator color={colors.clay} /> : null}
        </View>
      }
      ListEmptyComponent={
        remote.status === 'loading' ? (
          <View style={{ gap: spacing.md }}>
            {[0, 1].map((i) => (
              <Skeleton key={i} height={150} />
            ))}
          </View>
        ) : remote.status === 'error' ? (
          <EmptyState icon="wifi-off" tone="error" title="Couldn't load your addresses" message={remote.error} action={<Button title="Try again" onPress={remote.reload} />} />
        ) : (
          <EmptyState
            icon="map-pin"
            title="No saved addresses yet"
            message="Add one here, or tick “Save this address” when you check out and it will be here next time."
          />
        )
      }
      renderItem={({ item }) => (
        <AddressCard
          address={item}
          busy={busy}
          onEdit={() => router.push(`/addresses/${item._id}`)}
          onDefault={() => run(() => makeDefaultAddress(item._id))}
          onDelete={() => confirmDelete(item)}
        />
      )}
    />
  )
}

export default function Addresses() {
  const { user } = useAuth()
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Saved addresses
        </AppText>
      </View>
      <RequireCustomer next="/addresses" icon="map-pin" title="Sign in to see your addresses" message="Your saved delivery addresses belong to your account.">
        <AddressesList userId={user?.id} />
      </RequireCustomer>
    </SafeAreaView>
  )
}
