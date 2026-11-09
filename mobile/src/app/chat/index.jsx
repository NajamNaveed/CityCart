import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { fetchProviderConversations } from '../../services/providerChats'
import { listTime, MAX_MESSAGE_LENGTH } from '../../utils/chat'
import { isObjectId } from '../../utils/ids'
import { colors, radius, spacing } from '../../theme'

const FILTERS = [
  { value: 'all', label: 'All chats' },
  { value: 'store', label: 'Stores' },
  { value: 'provider', label: 'Service providers' },
]

const KIND_LABEL = { store: 'Store', provider: 'Service' }

/**
 * One page of the inbox. Stores and direct provider chats live in different
 * collections, so a merged view asks both; the store list drives paging, and
 * providers are only asked again when the filter is providers-only (the same
 * rule the web chat panel uses).
 */
async function fetchInbox(scope, page) {
  const includeStore = scope !== 'provider'
  const includeProvider = scope !== 'store'
  const [store, provider] = await Promise.all([
    includeStore ? fetchConversations(page) : null,
    includeProvider && (scope === 'provider' || page === 1) ? fetchProviderConversations(page) : null,
  ])
  const items = [
    ...(store?.items || []).map((conversation) => ({ ...conversation, kind: 'store' })),
    ...(provider?.items || []).map((conversation) => ({ ...conversation, kind: 'provider' })),
  ]
  return { items, pagination: (includeStore ? store : provider)?.pagination }
}

function ConversationsList({ userId }) {
  const router = useRouter()
  const [scope, setScope] = useState('all')
  const list = usePagedList(`chats:${userId}:${scope}`, (page) => fetchInbox(scope, page))
  // Later store pages arrive without provider rows, so the merged order is
  // rebuilt from the whole list rather than trusting arrival order.
  const items = useMemo(
    () => [...list.items].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)),
    [list.items],
  )
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
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        {FILTERS.map((filter) => {
          const selected = filter.value === scope
          return (
            <Pressable
              key={filter.value}
              onPress={() => setScope(filter.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${filter.label}`}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                minHeight: 36,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.ink : colors.line,
                backgroundColor: selected ? colors.ink : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="label" style={{ color: selected ? colors.white : colors.ink, fontSize: 13 }}>
                {filter.label}
              </AppText>
            </Pressable>
          )
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(conversation) => `${conversation.kind}:${conversation._id}`}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md }}
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
          ) : scope === 'provider' ? (
            <EmptyState icon="message-circle" title="No provider chats yet" message="Open a service provider and choose “Message” to ask a question." action={<Button title="Browse services" onPress={() => router.navigate('/services')} />} />
          ) : scope === 'store' ? (
            <EmptyState icon="message-circle" title="No store chats yet" message="Open any product and choose “Chat with seller” to start one." action={<Button title="Browse shops" onPress={() => router.navigate('/nearby')} />} />
          ) : (
            <EmptyState icon="message-circle" title="No conversations yet" message="Chat with a seller about a product, or message a service provider about a job." action={<Button title="Browse shops" onPress={() => router.navigate('/nearby')} />} />
          )
        }
        renderItem={({ item: conversation }) => {
          const provider = conversation.kind === 'provider'
          const kindLabel = provider ? KIND_LABEL.provider : KIND_LABEL.store
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: `/chat/${conversation._id}`,
                  params: {
                    name: conversation.with?.name || (provider ? 'Service provider' : 'Seller'),
                    // Direct provider threads carry no canSend flag; the server
                    // still refuses if the thread is closed.
                    canSend: conversation.canSend === false ? '0' : '1',
                    ...(provider && { kind: 'provider' }),
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`${kindLabel} chat with ${conversation.with?.name || (provider ? 'service provider' : 'seller')}${conversation.unread ? `, ${conversation.unread} unread` : ''}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface })}
            >
              <BrandLogo brand={{ name: conversation.with?.name || '?', logo: conversation.with?.image }} size={48} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
                    {conversation.with?.name || (provider ? 'Service provider' : 'Seller')}
                  </AppText>
                  <AppText variant="small" style={{ fontSize: 12 }}>
                    {listTime(conversation.lastMessageAt)}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {scope === 'all' ? (
                    <View style={{ paddingHorizontal: spacing.xs, paddingVertical: 1, borderRadius: radius.sm, backgroundColor: colors.sand }}>
                      <AppText variant="small" style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.ink }}>
                        {kindLabel}
                      </AppText>
                    </View>
                  ) : null}
                  <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                    {conversation.lastSenderRole === 'CUSTOMER' ? 'You: ' : ''}
                    {conversation.lastMessagePreview || '…'}
                  </AppText>
                  {conversation.unread > 0 ? <UnreadPill count={conversation.unread} /> : null}
                </View>
              </View>
            </Pressable>
          )
        }}
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
    </View>
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
