import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import TextField from '../../components/ui/TextField'
import UnreadPill from '../../components/ui/UnreadPill'
import BackButton from '../../components/BackButton'
import RequireCustomer from '../../components/RequireCustomer'
import { BrandLogo } from '../../components/BrandCard'
import ProductImage from '../../components/ProductImage'
import { useAuth } from '../../hooks/useAuth'
import { useChat } from '../../hooks/useChat'
import { usePagedList } from '../../hooks/usePagedList'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { cleanMessageBody, fetchConversations, fetchProductChat, startChat } from '../../services/chats'
import { listTime, MAX_MESSAGE_LENGTH } from '../../utils/chat'
import { isObjectId } from '../../utils/ids'
import { colors, radius, spacing } from '../../theme'

function ConversationsList({ userId }) {
  const router = useRouter()
  const list = usePagedList(`chats:${userId}`, (page) => fetchConversations(page))
  const { subscribe, refreshUnread } = useChat()
  // One subscription for the screen's lifetime; the latest refresh is picked
  // up in an effect, so a new render never re-subscribes.
  const refreshRef = useRef(list.refresh)
  useEffect(() => {
    refreshRef.current = list.refresh
  })

  // A message arriving while the list is open (or a reconnect) re-reads the
  // list: it is the one place previews and unread counts are shown together.
  useEffect(() => subscribe(() => refreshRef.current()), [subscribe])

  useFocusEffect(
    useCallback(() => {
      refreshRef.current()
      refreshUnread()
      // refreshUnread is stable for the signed-in user; this runs on focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  return (
    <FlatList
      data={list.items}
      keyExtractor={(conversation) => conversation._id}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.6}
      ListEmptyComponent={
        list.loading ? (
          <View style={{ gap: spacing.md }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={84} />
            ))}
          </View>
        ) : list.error ? (
          <EmptyState icon="wifi-off" tone="error" title="Couldn't load your messages" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
        ) : (
          <EmptyState icon="message-circle" title="No conversations yet" message="Open any product and choose “Chat with seller” to start one." action={<Button title="Browse products" onPress={() => router.navigate('/shop')} />} />
        )
      }
      renderItem={({ item: conversation }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: `/chat/${conversation._id}`,
              params: { name: conversation.with?.name || 'Seller', canSend: conversation.canSend ? '1' : '0' },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Chat with ${conversation.with?.name || 'seller'}${conversation.unread ? `, ${conversation.unread} unread` : ''}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface })}
        >
          <BrandLogo brand={{ name: conversation.with?.name || '?', logo: conversation.with?.image }} size={48} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
                {conversation.with?.name || 'Seller'}
              </AppText>
              <AppText variant="small" style={{ fontSize: 12 }}>
                {listTime(conversation.lastMessageAt)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                {conversation.lastSenderRole === 'CUSTOMER' ? 'You: ' : ''}
                {conversation.lastMessagePreview || '…'}
              </AppText>
              {conversation.unread > 0 ? <UnreadPill count={conversation.unread} /> : null}
            </View>
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        list.loadingMore ? null : list.hasMore ? (
          <Pressable onPress={list.loadMore} accessibilityRole="button" style={{ alignItems: 'center', padding: spacing.lg }}>
            <AppText variant="label" style={{ color: colors.clay }}>
              Show more conversations
            </AppText>
          </Pressable>
        ) : null
      }
    />
  )
}

/**
 * Arriving from a product page ("Chat with seller"): an existing thread with
 * that brand opens straight away, otherwise the first message starts one.
 */
function StartPanel({ productId }) {
  const router = useRouter()
  const remote = useRemote(`product-chat:${productId}`, () => fetchProductChat(productId))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const context = remote.data

  // A thread with this brand already exists: it is the conversation to open.
  useEffect(() => {
    if (context?.conversationId) router.replace(`/chat/${context.conversationId}`)
  }, [context, router])

  async function send() {
    const body = cleanMessageBody(draft)
    if (!body || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await startChat({ productId, body })
      router.replace(`/chat/${result.conversationId}`)
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't send your message. Please try again."))
      setBusy(false)
    }
  }

  if (remote.status === 'loading') {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={64} />
        <Skeleton height={120} />
        <Skeleton height={56} />
      </View>
    )
  }
  if (remote.status === 'error') {
    return (
      <View style={{ padding: spacing.lg }}>
        <EmptyState icon="wifi-off" tone="error" title="Couldn't open this chat" message={remote.error} action={<Button title="Try again" onPress={remote.reload} />} />
      </View>
    )
  }
  if (!context?.brand) {
    return (
      <View style={{ padding: spacing.lg }}>
        <EmptyState icon="message-circle" title="This product is not available" message="It may have been removed by the seller." />
      </View>
    )
  }

  const remaining = MAX_MESSAGE_LENGTH - draft.length
  return (
    <View style={{ flex: 1, padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <BrandLogo brand={context.brand} size={48} />
        <View style={{ flex: 1 }}>
          <AppText variant="strong">{context.brand.name}</AppText>
          <AppText variant="small">Say hello — ask about sizes, delivery, anything.</AppText>
        </View>
      </View>

      {context.product ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
          <ProductImage src={context.product.image} name={context.product.name} width={44} style={{ width: 44, height: 44, borderRadius: radius.sm }} />
          <View style={{ flex: 1 }}>
            <AppText variant="label" numberOfLines={1}>
              {context.product.name}
            </AppText>
            <AppText variant="small">Attached to your first message</AppText>
          </View>
        </View>
      ) : null}

      <TextField
        label="Message"
        value={draft}
        onChangeText={setDraft}
        placeholder={`Message ${context.brand.name}…`}
        multiline
        maxLength={MAX_MESSAGE_LENGTH}
        autoFocus
      />
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button title="Send" variant="clay" onPress={send} loading={busy} disabled={!cleanMessageBody(draft) || remaining < 0} />
        </View>
        {remaining <= 200 ? (
          <AppText variant="small" accessibilityLabel={`${remaining} characters left`}>
            {remaining}
          </AppText>
        ) : null}
      </View>
    </View>
  )
}

export default function ChatScreen() {
  const { user } = useAuth()
  const rawProduct = useLocalSearchParams().product
  const productId = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct
  const startFor = isObjectId(productId) ? productId : null

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Messages
        </AppText>
      </View>
      <RequireCustomer
        next={startFor ? `/chat?product=${startFor}` : '/chat'}
        icon="message-circle"
        title="Sign in to see your messages"
        message="Your conversations with sellers are kept in your account."
      >
        {startFor ? <StartPanel productId={startFor} /> : <ConversationsList userId={user?.id} />}
      </RequireCustomer>
    </SafeAreaView>
  )
}
