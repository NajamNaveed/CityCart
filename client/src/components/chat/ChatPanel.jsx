import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Paperclip, Send, Wrench, X } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useChat } from '../../hooks/useChat'
import ProductImage from '../ProductImage'
import { Spinner } from '../ui'
import { formatPrice } from '../../ui'
import { clockTime, dayLabel, initialOf, isObjectId, listTime, MAX_MESSAGE_LENGTH } from '../../utils/chat'
import { CHAT_OPEN_STATUSES } from '../../utils/serviceBookings'

const PAGE = 30

// Three REST families share one panel: brand store chats, direct provider
// chats, and a booking's own thread. `kind` in the URL picks the family.
const baseFor = (kind) =>
  kind === 'provider' ? '/services/direct-chats' : kind === 'booking' ? '/services/chats' : '/chats'

// Booking lists are keyed by conversation but their thread endpoints by
// booking id, so the open thread is always addressed by this value.
const threadIdOf = (item) => (item.kind === 'booking' ? item.bookingId : item._id)

function Avatar({ name, image, size = 'h-10 w-10' }) {
  return image ? (
    <img src={image} alt="" className={`${size} shrink-0 rounded-full border border-line-warm object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-sand text-sm font-semibold text-clay`}>
      {initialOf(name)}
    </span>
  )
}

// A product mentioned in a message (or about to be attached to the next one).
function ProductChip({ product, onRemove }) {
  return (
    <div className="flex items-center gap-2.5 rounded-tile border border-line-warm bg-paper-warm p-2 pr-3 text-left">
      <ProductImage src={product.image} name={product.name} width={80} className="h-10 w-10 shrink-0 rounded-lg" />
      <span className="min-w-0 flex-1">
        <Link to={`/product/${product._id}`} className="block truncate text-[13px] font-medium text-ink hover:underline">
          {product.name}
        </Link>
        <span className="block text-[11px] text-muted">{formatPrice(product.price)}{!product.available && ' · No longer available'}</span>
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove attached product" className="text-muted transition hover:text-ink">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// Message text is always rendered as a text node: whatever a person types,
// including <tags>, is shown literally and never interpreted as HTML.
function Bubble({ message, showSender }) {
  return (
    <div className={`flex flex-col ${message.mine ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed sm:max-w-[75%] ${message.mine ? 'rounded-br-md bg-noir text-cream' : 'rounded-bl-md border border-line-warm bg-paper-warm text-ink'}`}>
        {message.product && (
          <div className="mb-2 text-ink">
            <ProductChip product={message.product} />
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <p className="mt-1 px-1 text-[10.5px] text-ink/40">
        {showSender && message.sentBy ? `${message.sentBy} · ` : ''}
        {clockTime(message.createdAt)}
      </p>
    </div>
  )
}

/**
 * The whole chat experience. The customer's /chat page uses "all" to merge
 * store threads and direct provider threads under one filter bar; the brand
 * dashboard uses a single store scope; the provider dashboard merges the
 * booking threads and direct threads customers start from the provider page.
 *
 * URL state: ?c=<thread id> & ?k=store|provider|booking is the open thread;
 * ?product=<id> (customer, store) starts from a product page; and
 * ?provider=<id> (customer) opens a direct thread with a provider.
 * Every read and send goes through the REST API, which enforces membership.
 */
export default function ChatPanel({ mode = 'customer', source, canReply = true }) {
  const isBrand = mode === 'brand'
  const isProvider = mode === 'provider'
  const isCustomer = mode === 'customer'
  const mySide = isProvider ? 'PROVIDER' : isBrand ? 'BRAND' : 'CUSTOMER'
  const scope = source || (isProvider ? 'provider' : isBrand ? 'store' : 'all')
  const includeStore = scope !== 'provider'
  const includeProvider = scope !== 'store'
  // A provider sees both service conversation kinds in one inbox.
  const includeBooking = isProvider

  const { refreshUnread, subscribe } = useChat()
  const [params, setParams] = useSearchParams()

  // The page owns filter parameters (e.g. ?tab=); the panel only adds or
  // removes the ones that describe the open thread.
  const patchParams = useCallback(
    (patch, options) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value == null) next.delete(key)
          else next.set(key, value)
        }
        return next
      }, options)
    },
    [setParams],
  )

  const pickKind = (raw) => {
    if (raw === 'booking' && includeBooking) return 'booking'
    if (raw === 'provider' && includeProvider) return 'provider'
    if (includeStore) return 'store'
    return 'provider'
  }

  const rawSelected = params.get('c')
  const selected = isObjectId(rawSelected) ? { id: rawSelected, kind: pickKind(params.get('k')) } : null
  const selectedKey = selected ? `${selected.kind}:${selected.id}` : null

  const rawProduct = params.get('product')
  const productId = isCustomer && includeStore && isObjectId(rawProduct) ? rawProduct : null
  const rawProvider = params.get('provider')
  const startProviderId = isCustomer && includeProvider && isObjectId(rawProvider) ? rawProvider : null

  const [list, setList] = useState({ items: [], page: 0, pages: 1, loading: true, error: '' })
  const [thread, setThread] = useState({ key: null, messages: [], hasMore: false, loading: false, error: '' })
  const [context, setContext] = useState(null) // { product, brand } from a product page
  const [contextError, setContextError] = useState('')
  const [attach, setAttach] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loadingEarlier, setLoadingEarlier] = useState(false)

  const selectedRef = useRef(selectedKey)
  const scroller = useRef(null)
  const scrollPlan = useRef({ mode: 'bottom', height: 0 })

  useEffect(() => {
    selectedRef.current = selectedKey
  }, [selectedKey])

  // ---- conversation lists --------------------------------------------------
  const fetchPage = useCallback(
    async (page = 1) => {
      const [storeRes, providerRes, bookingRes] = await Promise.all([
        includeStore ? api.get('/chats', { params: { page, limit: 20 } }) : null,
        includeProvider && (scope === 'provider' || page === 1)
          ? api.get('/services/direct-chats', { params: { page, limit: 20 } })
          : null,
        includeBooking && page === 1 ? api.get('/services/chats', { params: { page: 1, limit: 20 } }) : null,
      ])
      return {
        items: [
          ...(storeRes?.data?.conversations || []).map((c) => ({ ...c, kind: 'store' })),
          ...(providerRes?.data?.conversations || []).map((c) => ({ ...c, kind: 'provider' })),
          ...(bookingRes?.data?.items || []).map((c) => ({ ...c, kind: 'booking' })),
        ],
        paged: includeStore ? storeRes : providerRes,
      }
    },
    [includeStore, includeProvider, includeBooking, scope],
  )

  const loadList = useCallback(
    async (page = 1) => {
      try {
        const { items, paged } = await fetchPage(page)
        setList((prev) => {
          const base = page === 1 ? [] : prev.items
          const seen = new Set(base.map((c) => `${c.kind}:${c._id}`))
          const fresh = items.filter((c) => !seen.has(`${c.kind}:${c._id}`))
          return {
            items: [...base, ...fresh].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
            page: paged?.data?.pagination?.page ?? prev.page,
            pages: paged?.data?.pagination?.pages ?? prev.pages,
            loading: false,
            error: '',
          }
        })
      } catch (err) {
        setList((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) }))
      }
    },
    [fetchPage],
  )

  useEffect(() => {
    let active = true
    fetchPage(1)
      .then(({ items, paged }) => {
        if (!active) return
        setList({
          items: items.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
          page: paged?.data?.pagination?.page || 0,
          pages: paged?.data?.pagination?.pages || 1,
          loading: false,
          error: '',
        })
      })
      .catch((err) => active && setList((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) })))
    return () => {
      active = false
    }
  }, [fetchPage])

  // ---- arriving from a product page ---------------------------------------
  useEffect(() => {
    if (!productId) return undefined
    let active = true
    api
      .get(`/chats/product/${productId}`)
      .then((res) => {
        if (!active) return
        setContext(res.data)
        setContextError('')
        setAttach(res.data.product)
        // Already talking to this seller: open that thread rather than a blank one.
        if (res.data.conversationId && !selectedRef.current) {
          patchParams({ c: res.data.conversationId, k: 'store', product: null }, { replace: true })
        }
      })
      .catch((err) => active && setContextError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [productId, patchParams])

  // ---- arriving from a provider page --------------------------------------
  useEffect(() => {
    if (!startProviderId) return undefined
    let active = true
    api
      .post('/services/direct-chats/start', { providerId: startProviderId })
      .then((res) => {
        if (!active) return
        setContextError('')
        patchParams({ c: res.data.conversationId, k: 'provider', provider: null }, { replace: true })
        loadList(1)
      })
      .catch((err) => active && setContextError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [startProviderId, patchParams, loadList])

  // ---- the open thread -----------------------------------------------------
  const markRead = useCallback(
    async (id, kind) => {
      try {
        await api.post(`${baseFor(kind)}/${id}/read`)
        setList((prev) => ({
          ...prev,
          items: prev.items.map((c) => (c.kind === kind && threadIdOf(c) === id ? { ...c, unread: 0 } : c)),
        }))
        refreshUnread()
      } catch {
        /* the badge corrects itself on the next refresh */
      }
    },
    [refreshUnread],
  )

  const loadThread = useCallback(
    async (key) => {
      if (!key) return
      const [kind, id] = key.split(':')
      try {
        const res = await api.get(`${baseFor(kind)}/${id}/messages`, { params: { limit: PAGE } })
        if (selectedRef.current !== key) return
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread({ key, messages: res.data.messages, hasMore: res.data.hasMore, loading: false, error: '' })
        markRead(id, kind)
      } catch (err) {
        if (selectedRef.current === key) setThread({ key, messages: [], hasMore: false, loading: false, error: getErrorMessage(err) })
      }
    },
    [markRead],
  )

  // "Loading" is derived (the thread in state is not the selected one yet), so
  // the previous conversation's messages never flash under a new header.
  useEffect(() => {
    if (!selected) return undefined
    let active = true
    const key = `${selected.kind}:${selected.id}`
    api
      .get(`${baseFor(selected.kind)}/${selected.id}/messages`, { params: { limit: PAGE } })
      .then((res) => {
        if (!active) return
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread({ key, messages: res.data.messages, hasMore: res.data.hasMore, loading: false, error: '' })
        markRead(selected.id, selected.kind)
      })
      .catch((err) => active && setThread({ key, messages: [], hasMore: false, loading: false, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [selected?.id, selected?.kind, markRead])

  async function loadEarlier() {
    const oldest = thread.messages[0]
    if (!oldest || loadingEarlier || !selected) return
    setLoadingEarlier(true)
    try {
      const res = await api.get(`${baseFor(selected.kind)}/${selected.id}/messages`, {
        params: { before: oldest._id, limit: PAGE },
      })
      scrollPlan.current = { mode: 'keep', height: scroller.current ? scroller.current.scrollHeight : 0 }
      setThread((t) => ({ ...t, messages: [...res.data.messages, ...t.messages], hasMore: res.data.hasMore }))
    } catch (err) {
      setThread((t) => ({ ...t, error: getErrorMessage(err) }))
    } finally {
      setLoadingEarlier(false)
    }
  }

  // Stay at the newest message; after loading earlier ones keep the reader's place.
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box) return
    if (scrollPlan.current.mode === 'keep') box.scrollTop = box.scrollHeight - scrollPlan.current.height
    else box.scrollTop = box.scrollHeight
  }, [thread.messages, thread.key])

  // ---- live messages -------------------------------------------------------
  useEffect(
    () =>
      subscribe((type, payload) => {
        if (type === 'resync') {
          loadList(1)
          if (selectedRef.current) loadThread(selectedRef.current)
          return
        }
        const kind =
          payload.kind === 'PROVIDER' ? 'provider' : payload.kind === 'SERVICE_BOOKING' ? 'booking' : 'store'
        if (
          (kind === 'provider' && !includeProvider) ||
          (kind === 'store' && !includeStore) ||
          (kind === 'booking' && !includeBooking)
        ) {
          return
        }
        const { conversationId, message } = payload
        const threadId = kind === 'booking' ? payload.bookingId : conversationId
        const key = `${kind}:${threadId}`
        const open = key === selectedRef.current
        const matches = (c) => c.kind === kind && c._id === conversationId
        setList((prev) => {
          if (!prev.items.some(matches)) return prev
          const updated = prev.items.map((c) =>
            matches(c)
              ? {
                  ...c,
                  lastMessageAt: payload.lastMessageAt,
                  lastMessagePreview: payload.lastMessagePreview,
                  lastSenderRole: message.senderRole,
                  unread: open || message.mine ? 0 : c.unread + 1,
                }
              : c,
          )
          return { ...prev, items: [...updated].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)) }
        })
        // A brand-new conversation (its first message) is not in the list yet.
        setList((prev) => {
          if (!prev.items.some(matches)) loadList(1)
          return prev
        })
        if (open) {
          scrollPlan.current = { mode: 'bottom', height: 0 }
          setThread((t) => (t.messages.some((m) => m._id === message._id) ? t : { ...t, messages: [...t.messages, message] }))
          if (!message.mine) markRead(threadId, kind)
        }
      }),
    [subscribe, loadList, loadThread, markRead, includeProvider, includeStore, includeBooking],
  )

  // ---- sending -------------------------------------------------------------
  const current = selected ? list.items.find((c) => c.kind === selected.kind && threadIdOf(c) === selected.id) : null
  const starting = !selected && Boolean(context)
  const bookingOpen = current?.kind !== 'booking' || CHAT_OPEN_STATUSES.includes(current.status)
  const counterpart = current?.with || (starting ? { name: context.brand.name, image: context.brand.logo } : null)
  const canSend = canReply && bookingOpen && (starting || (current ? current.canSend !== false : true))

  async function onSend(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending || !canSend) return
    setSending(true)
    setSendError('')
    try {
      if (starting) {
        const res = await api.post('/chats/start', { productId: context.product._id, body })
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread({ key: `store:${res.data.conversationId}`, messages: [res.data.message], hasMore: false, loading: false, error: '' })
        // The product link has done its job: from here on this is just the thread.
        patchParams({ c: res.data.conversationId, k: 'store', product: null }, { replace: true })
        setContext(null)
      } else {
        const res = await api.post(`${baseFor(selected.kind)}/${selected.id}/messages`, {
          body,
          ...(attach && selected.kind === 'store' && !isBrand && { productId: attach._id }),
        })
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread((t) => (t.messages.some((m) => m._id === res.data.message._id) ? t : { ...t, messages: [...t.messages, res.data.message] }))
        if (attach) patchParams({ c: selected.id, k: selected.kind, product: null }, { replace: true })
      }
      setDraft('')
      setAttach(null)
      loadList(1)
    } catch (err) {
      setSendError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event) {
    // Enter sends; Shift+Enter adds a line. Never while an IME is composing.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) onSend(event)
  }

  const open = (id, kind) => patchParams({ c: id, k: kind })
  const back = () => patchParams({ c: null, k: null })
  const threadOpen = Boolean(selected || starting)

  const emptyCopy = isProvider
    ? {
        title: 'No customer messages yet',
        body: 'Pre-booking questions and booking threads with your customers both show up here.',
      }
    : isBrand
      ? { title: 'No conversations yet', body: 'When a customer messages your brand, it shows up here.' }
      : {
          title: 'No conversations yet',
          body: 'Ask a seller about a product, or message a service provider from their page.',
        }

  const kindLabel = (kind) => (kind === 'provider' ? 'Service' : kind === 'booking' ? 'Booking' : 'Store')

  // ---- render --------------------------------------------------------------
  const threadKey = starting ? 'starting' : selectedKey
  const threadReady = starting || thread.key === threadKey
  const messages = threadReady ? thread.messages : []
  const rows = messages.map((m, i) => ({ m, divider: i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt) }))

  return (
    <div className="grid h-[calc(100dvh-15rem)] min-h-[460px] overflow-hidden rounded-panel border border-line-warm bg-paper-warm md:grid-cols-[320px_1fr]">
      {/* Conversations */}
      <aside className={`min-h-0 min-w-0 flex-col border-line-warm md:flex md:border-r ${threadOpen ? 'hidden' : 'flex'}`} aria-label="Conversations">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.loading ? (
            <div className="p-5">
              <Spinner label="Loading conversations…" />
            </div>
          ) : list.error ? (
            <p className="p-5 text-[13px] text-clay">{list.error}</p>
          ) : list.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-tile bg-sand text-clay">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="font-display mt-4 text-[19px] font-semibold tracking-tight text-ink">{emptyCopy.title}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/55">{emptyCopy.body}</p>
              {isCustomer && (
                <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[12.5px] font-medium">
                  <Link to="/nearby" className="text-clay underline-offset-4 hover:underline">
                    Browse shops
                  </Link>
                  <Link to="/services" className="text-clay underline-offset-4 hover:underline">
                    Browse services
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <ul>
              {list.items.map((c) => (
                <li key={`${c.kind}:${c._id}`}>
                  <button
                    type="button"
                    onClick={() => open(threadIdOf(c), c.kind)}
                    aria-current={selected?.kind === c.kind && selected?.id === threadIdOf(c)}
                    className={`flex w-full items-center gap-3 border-b border-line-warm px-4 py-3.5 text-left transition hover:bg-canvas ${selected?.kind === c.kind && selected?.id === threadIdOf(c) ? 'bg-canvas' : ''}`}
                  >
                    <Avatar name={c.with.name} image={c.with.image} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={`truncate text-[14px] ${c.unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{c.with.name}</span>
                          {(scope === 'all' || includeBooking) && (
                            <span className="shrink-0 rounded-full bg-sand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink/50">
                              {kindLabel(c.kind)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10.5px] text-ink/40">{listTime(c.lastMessageAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`truncate text-[12.5px] ${c.unread ? 'text-ink/70' : 'text-ink/45'}`}>
                          {c.lastMessagePreview
                            ? `${c.lastSenderRole === mySide ? 'You: ' : ''}${c.lastMessagePreview}`
                            : 'No messages yet'}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-clay px-1.5 text-[10.5px] font-semibold text-white">
                            {c.unread > 9 ? '9+' : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {list.page > 0 && list.page < list.pages && (
                <li className="p-3 text-center">
                  <button type="button" onClick={() => loadList(list.page + 1)} className="text-[12.5px] font-medium text-clay underline-offset-4 hover:underline">
                    Show more conversations
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={`min-h-0 min-w-0 flex-col md:flex ${threadOpen ? 'flex' : 'hidden'}`} aria-label="Conversation">
        {!threadOpen ? (
          <div className="hidden h-full flex-col items-center justify-center px-6 text-center md:flex">
            <span className="flex h-12 w-12 items-center justify-center rounded-tile bg-sand text-clay">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[13px] text-ink/55">{contextError || 'Choose a conversation to read it.'}</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line-warm px-4 py-3">
              <button type="button" onClick={back} aria-label="Back to conversations" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-canvas md:hidden">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              {counterpart && <Avatar name={counterpart.name} image={counterpart.image} size="h-9 w-9" />}
              <p className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold text-ink">{counterpart ? counterpart.name : ''}</p>
              {current?.kind === 'booking' ? (
                <Link
                  to={isProvider ? `/provider/bookings/${selected.id}` : `/bookings/${selected.id}`}
                  className="hidden items-center gap-1 text-[12px] font-medium text-clay underline-offset-4 hover:underline sm:inline-flex"
                >
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  Booking
                </Link>
              ) : current?.kind === 'provider' && current.with.slug ? (
                <Link to={`/services/${current.with.slug}`} className="hidden items-center gap-1 text-[12px] font-medium text-clay underline-offset-4 hover:underline sm:inline-flex">
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                  Profile
                </Link>
              ) : null}
            </header>

            <div ref={scroller} role="log" aria-live="polite" aria-label="Messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas/40 px-4 py-4">
              {!threadReady ? (
                <Spinner label="Loading messages…" />
              ) : thread.error ? (
                <p className="text-[13px] text-clay">{thread.error}</p>
              ) : (
                <>
                  {thread.hasMore && !starting && (
                    <div className="text-center">
                      <button type="button" onClick={loadEarlier} disabled={loadingEarlier} className="text-[12.5px] font-medium text-clay underline-offset-4 hover:underline disabled:opacity-50">
                        {loadingEarlier ? 'Loading…' : 'Show earlier messages'}
                      </button>
                    </div>
                  )}
                  {starting && messages.length === 0 && (
                    <div className="mx-auto max-w-sm space-y-3 pt-4 text-center">
                      <p className="text-[12.5px] leading-relaxed text-ink/55">Ask {context.brand.name} about this product. They usually reply in the chat.</p>
                      <ProductChip product={context.product} />
                    </div>
                  )}
                  {!starting && current?.kind === 'provider' && messages.length === 0 && (
                    <p className="mx-auto max-w-sm pt-4 text-center text-[12.5px] leading-relaxed text-ink/55">
                      Say hello and describe the job you need. Quotes and times are still agreed inside a booking.
                    </p>
                  )}
                  {rows.map(({ m, divider }) => (
                    <div key={m._id} className="space-y-3">
                      {divider && <p className="text-center text-[10px] font-medium uppercase tracking-[0.16em] text-ink/40">{dayLabel(m.createdAt)}</p>}
                      <Bubble message={m} showSender={isBrand || isProvider} />
                    </div>
                  ))}
                </>
              )}
            </div>

            <form onSubmit={onSend} className="border-t border-line-warm bg-paper-warm p-3">
              {!canReply ? (
                <p className="px-1 py-2 text-[13px] text-muted">You can read messages, but you do not have permission to reply.</p>
              ) : !bookingOpen ? (
                <p className="px-1 py-2 text-[13px] text-muted">This booking&rsquo;s chat is closed.</p>
              ) : !canSend ? (
                <p className="px-1 py-2 text-[13px] text-muted">This seller is not taking messages right now.</p>
              ) : (
                <>
                  {attach && !isBrand && (
                    <div className="mb-2 flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <ProductChip product={attach} onRemove={starting ? undefined : () => setAttach(null)} />
                      </div>
                    </div>
                  )}
                  {sendError && (
                    <p role="alert" className="mb-2 rounded-tile border border-clay/30 bg-clay/5 px-3 py-2 text-[12.5px] text-clay">
                      {sendError}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <label htmlFor="chat-message" className="sr-only">
                      Write a message
                    </label>
                    <textarea
                      id="chat-message"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKeyDown}
                      maxLength={MAX_MESSAGE_LENGTH}
                      rows={2}
                      placeholder="Write a message…"
                      className="min-h-[44px] flex-1 resize-none rounded-tile border border-line-warm bg-canvas/40 px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-muted/60 focus:border-ink/40 focus:bg-white focus:ring-2 focus:ring-ink/10"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-tile bg-noir px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream transition-colors hover:bg-noir-soft disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {draft.length > MAX_MESSAGE_LENGTH * 0.8 && (
                    <p className="mt-1 text-right text-[10.5px] text-ink/40">
                      {draft.length}/{MAX_MESSAGE_LENGTH}
                    </p>
                  )}
                </>
              )}
            </form>
          </>
        )}
      </section>
    </div>
  )
}
