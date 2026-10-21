import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import BackButton from '../../components/BackButton'
import { useChat } from '../../hooks/useChat'
import { getErrorMessage } from '../../services/api'
import { cleanMessageBody, fetchMessages, markConversationRead, sendMessage } from '../../services/chats'
import { clockTime, dayLabel, MAX_MESSAGE_LENGTH } from '../../utils/chat'
import { colors, radius, spacing } from '../../theme'

// Rows for the inverted list, newest first: messages with a divider whenever
// the day changes. The visual order is built oldest → newest, then reversed.
function threadRows(messages) {
  const rows = []
  let lastDay = null
  for (const message of messages) {
    const day = dayLabel(message.createdAt)
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `day:${day}:${rows.length}`, label: day })
      lastDay = day
    }
    rows.push({ kind: 'message', key: message._id, message })
  }
  return rows.reverse()
}

function ProductChip({ product }) {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push(`/product/${product._id}`)}
      accessibilityRole="link"
      accessibilityLabel={`Open ${product.name}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, marginBottom: spacing.xs, borderRadius: radius.sm, backgroundColor: pressed ? colors.sand : colors.paper, borderWidth: 1, borderColor: colors.line, alignSelf: 'stretch' })}
    >
      <Feather name="package" size={14} color={colors.clay} />
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1} style={{ fontSize: 12 }}>
          {product.name}
        </AppText>
      </View>
      <Feather name="chevron-right" size={14} color={colors.muted} />
    </Pressable>
  )
}

function Bubble({ message }) {
  const mine = message.mine
  return (
    <View style={{ maxWidth: '82%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          padding: spacing.md,
          borderRadius: radius.lg,
          borderTopRightRadius: mine ? radius.sm : radius.lg,
          borderTopLeftRadius: mine ? radius.lg : radius.sm,
          backgroundColor: mine ? colors.clay : colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.line,
        }}
      >
        {message.product ? <ProductChip product={message.product} /> : null}
        <AppText variant="body" style={{ color: mine ? colors.white : colors.ink }}>
          {message.body}
        </AppText>
      </View>
      <AppText variant="small" style={{ fontSize: 11, marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
        {clockTime(message.createdAt)}
      </AppText>
    </View>
  )
}

function Composer({ disabled, notice, draft, setDraft, onSend, sending }) {
  const insets = useSafeAreaInsets()
  const remaining = MAX_MESSAGE_LENGTH - draft.length
  const canSend = !disabled && !sending && Boolean(cleanMessageBody(draft))

  if (notice) {
    return (
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
        <AppText variant="small" style={{ textAlign: 'center' }}>
          {notice}
        </AppText>
      </View>
    )
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
      {sendCounter(remaining)}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <TextInput
          accessibilityLabel="Message"
          placeholder="Write a message…"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          editable={!sending}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 10, fontFamily: 'Poppins_400Regular', fontSize: 15, color: colors.ink }}
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: canSend ? colors.clay : colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Feather name="send" size={19} color={canSend ? colors.white : colors.muted} />}
        </Pressable>
      </View>
    </View>
  )
}

function sendCounter(remaining) {
  if (remaining > 200) return null
  return (
    <AppText variant="small" style={{ textAlign: 'right', marginBottom: spacing.xs }} accessibilityLabel={`${remaining} characters left`}>
      {remaining}
    </AppText>
  )
}

export default function ChatThread() {
  const rawId = useLocalSearchParams().id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const params = useLocalSearchParams()
  const name = Array.isArray(params.name) ? params.name[0] : params.name
  const canSendParam = Array.isArray(params.canSend) ? params.canSend[0] : params.canSend
  const { subscribe, refreshUnread } = useChat()

  const [thread, setThread] = useState({ id, status: 'loading', messages: [], hasMore: false, error: '' })
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const seen = useRef(new Set())

  const load = useCallback(async () => {
    setThread((current) => ({ ...current, id, status: current.id === id && current.messages.length ? current.status : 'loading', error: '' }))
    try {
      const { messages, hasMore } = await fetchMessages(id)
      seen.current = new Set(messages.map((m) => m._id))
      setThread({ id, status: 'ready', messages, hasMore, error: '' })
      await markConversationRead(id)
      refreshUnread()
    } catch (err) {
      setThread({ id, status: 'error', messages: [], hasMore: false, error: getErrorMessage(err, "Couldn't load this conversation.") })
    }
    // refreshUnread is stable for the signed-in user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const appendMessage = useCallback(
    (message) => {
      if (!message || seen.current.has(message._id)) return
      seen.current.add(message._id)
      setThread((current) => (current.id === message.conversationId ? { ...current, messages: [...current.messages, message] } : current))
    },
    [],
  )

  // Live arrivals: append, and a message from the seller is read immediately.
  useEffect(() => {
    const unsubscribe = subscribe((type, payload) => {
      if (type === 'resync') {
        load()
        return
      }
      if (payload?.conversationId !== id) return
      appendMessage(payload.message)
      if (payload.message && !payload.message.mine) {
        markConversationRead(id).catch(() => {})
        refreshUnread()
      }
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, id, load])

  async function loadEarlier() {
    const oldest = thread.messages[0]
    if (!oldest || loadingEarlier || !thread.hasMore) return
    setLoadingEarlier(true)
    try {
      const { messages, hasMore } = await fetchMessages(id, { before: oldest._id })
      const fresh = messages.filter((m) => !seen.current.has(m._id))
      fresh.forEach((m) => seen.current.add(m._id))
      setThread((current) => ({ ...current, messages: [...fresh, ...current.messages], hasMore }))
    } catch (err) {
      setThread((current) => ({ ...current, error: getErrorMessage(err, "Couldn't load earlier messages.") }))
    } finally {
      setLoadingEarlier(false)
    }
  }

  async function send() {
    const body = cleanMessageBody(draft)
    if (!body || sending) return
    setSending(true)
    setSendError('')
    try {
      const message = await sendMessage(id, body)
      appendMessage(message)
      setDraft('')
    } catch (err) {
      setSendError(getErrorMessage(err, "Couldn't send your message. Please try again."))
    } finally {
      setSending(false)
    }
  }

  const rows = useMemo(() => threadRows(thread.messages), [thread.messages])
  const canSend = canSendParam !== '0'

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
          {name || 'Chat'}
        </AppText>
      </View>

      {thread.status === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </View>
      ) : thread.status === 'error' ? (
        <View style={{ padding: spacing.lg }}>
          <EmptyState icon="wifi-off" tone="error" title="Couldn't load this conversation" message={thread.error} action={<Button title="Try again" onPress={load} />} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            inverted
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
            renderItem={({ item: row }) =>
              row.kind === 'day' ? (
                <AppText variant="small" style={{ textAlign: 'center', marginVertical: spacing.sm }} accessibilityRole="header">
                  {row.label}
                </AppText>
              ) : (
                <Bubble message={row.message} />
              )
            }
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState icon="message-circle" title="Say hello" message="Your message goes straight to the seller." />
              </View>
            }
            ListFooterComponent={
              thread.hasMore ? (
                <Pressable onPress={loadEarlier} disabled={loadingEarlier} accessibilityRole="button" style={{ alignItems: 'center', padding: spacing.md }}>
                  <AppText variant="label" style={{ color: loadingEarlier ? colors.muted : colors.clay }}>
                    {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
                  </AppText>
                </Pressable>
              ) : null
            }
          />
          {sendError ? (
            <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
              {sendError}
            </AppText>
          ) : null}
          <Composer
            disabled={!canSend}
            notice={canSend ? null : 'This seller is not taking messages right now.'}
            draft={draft}
            setDraft={setDraft}
            onSend={send}
            sending={sending}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  )
}
