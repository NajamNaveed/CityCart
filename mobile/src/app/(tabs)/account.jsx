import { Alert, Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useRouter } from 'expo-router'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import UnreadPill from '../../components/ui/UnreadPill'
import { useAuth } from '../../hooks/useAuth'
import { useChat } from '../../hooks/useChat'
import { useNotifications } from '../../hooks/useNotifications'
import { colors, radius, spacing } from '../../theme'

function AccountRow({ icon, label, badge, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface })}
    >
      <Feather name={icon} size={20} color={colors.clay} />
      <AppText variant="strong" style={{ flex: 1 }}>
        {label}
      </AppText>
      {badge ? <UnreadPill count={badge} /> : null}
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  )
}

export default function Account() {
  const router = useRouter()
  const { status, user, offline, logout, retry } = useAuth()
  const { unread: chatUnread } = useChat()
  const { unreadCount: notificationUnread } = useNotifications()

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
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <AccountRow icon="package" label="My orders" onPress={() => router.push('/orders')} />
          <AccountRow icon="message-circle" label="Messages" badge={chatUnread} onPress={() => router.push('/chat')} />
          <AccountRow icon="bell" label="Notifications" badge={notificationUnread} onPress={() => router.push('/notifications')} />
        </View>
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
