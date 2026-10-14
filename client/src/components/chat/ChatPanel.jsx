import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Paperclip, Send, X } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useChat } from '../../hooks/useChat'
import ProductImage from '../ProductImage'
import { Spinner } from '../ui'
import { formatPrice } from '../../ui'
import { clockTime, dayLabel, initialOf, isObjectId, listTime, MAX_MESSAGE_LENGTH } from '../../utils/chat'

const PAGE = 30

function Avatar({ name, image, size = 'h-10 w-10' }) {
  return image ? (
    <img src={image} alt="" className={`${size} shrink-0 rounded-full border border-line object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-sand text-sm font-semibold text-clay`}>
      {initialOf(name)}
    </span>
  )
}

// A product mentioned in a message (or about to be attached to the next one).
function ProductChip({ product, onRemove }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-white p-2 pr-3 text-left">
      <ProductImage src={product.image} name={product.name} width={80} className="h-10 w-10 shrink-0 rounded" />
      <span className="min-w-0 flex-1">
        <Link to={`/product/${product._id}`} className="block truncate text-[13px] font-medium text-ink hover:underline">
          {product.name}
        </Link>
        <span className="block text-xs text-muted">{formatPrice(product.price)}{!product.available && ' · No longer available'}</span>
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
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed sm:max-w-[75%] ${message.mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-paper text-ink'}`}>
        {message.product && (
          <div className="mb-2 text-ink">
            <ProductChip product={message.product} />
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted">
        {showSender && message.sentBy ? `${message.sentBy} · ` : ''}
        {clockTime(message.createdAt)}
      </p>
    </div>
  )
}

/**
 * The whole chat experience, used by the customer's /chat page (mode
 * "customer") and the seller's Messages page (mode "brand"): conversation
 * list, live thread, composer. Messages arrive over the shared socket; every
 * send and read goes through the REST API, which is where access is enforced.
 *
 * URL state: ?c=<conversation id> is the open thread; ?product=<id> (customer
 * only) is the product page the shopper came from.
 */
export default function ChatPanel({ mode, canReply = true }) {
  const isBrand = mode === 'brand'
  const mySide = isBrand ? 'BRAND' : 'CUSTOMER'
  const { refreshUnread, subscribe } = useChat()
  const [params, setParams] = useSearchParams()

  const rawSelected = params.get('c')
  const selected = isObjectId(rawSelected) ? rawSelected : null
  const rawProduct = params.get('product')
  const productId = !isBrand && isObjectId(rawProduct) ? rawProduct : null

  const [list, setList] = useState({ items: [], page: 0, pages: 1, loading: true, error: '' })
  const [thread, setThread] = useState({ id: null, messages: [], hasMore: false, loading: false, error: '' })
  const [context, setContext] = useState(null) // { product, brand, conversationId } from a product page
  const [contextError, setContextError] = useState('')
  const [attach, setAttach] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loadingEarlier, setLoadingEarlier] = useState(false)

  const selectedRef = useRef(selected)
  const scroller = useRef(null)
  const scrollPlan = useRef({ mode: 'bottom', height: 0 })

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // ---- conversation list --------------------------------------------------
  const loadList = useCallback(
    async (page = 1) => {
      try {
        const res = await api.get('/chats', { params: { page, limit: 20 } })
        setList((prev) => ({
          items: page === 1 ? res.data.conversations : [...prev.items, ...res.data.conversations.filter((c) => !prev.items.some((p) => p._id === c._id))],
          page: res.data.pagination.page,
          pages: res.data.pagination.pages,
          loading: false,
          error: '',
        }))
      } catch (err) {
        setList((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) }))
      }
    },
    [],
  )

  useEffect(() => {
    let active = true
    api
      .get('/chats', { params: { page: 1, limit: 20 } })
      .then((res) => active && setList({ items: res.data.conversations, page: res.data.pagination.page, pages: res.data.pagination.pages, loading: false, error: '' }))
      .catch((err) => active && setList((prev) => ({ ...prev, loading: false, error: getErrorMessage(err) })))
    return () => {
      active = false
    }
  }, [])

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
          setParams((p) => {
            const next = new URLSearchParams(p)
            next.set('c', res.data.conversationId)
            return next
          }, { replace: true })
        }
      })
      .catch((err) => active && setContextError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [productId, setParams])

  // ---- the open thread -----------------------------------------------------
  const markRead = useCallback(
    async (id) => {
      try {
        await api.post(`/chats/${id}/read`)
        setList((prev) => ({ ...prev, items: prev.items.map((c) => (c._id === id ? { ...c, unread: 0 } : c)) }))
        refreshUnread()
      } catch {
        /* the badge corrects itself on the next refresh */
      }
    },
    [refreshUnread],
  )

  const loadThread = useCallback(
    async (id) => {
      try {
        const res = await api.get(`/chats/${id}/messages`, { params: { limit: PAGE } })
        if (selectedRef.current !== id) return
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread({ id, messages: res.data.messages, hasMore: res.data.hasMore, loading: false, error: '' })
        markRead(id)
      } catch (err) {
        if (selectedRef.current === id) setThread({ id, messages: [], hasMore: false, loading: false, error: getErrorMessage(err) })
      }
    },
    [markRead],
  )

  // "Loading" is derived (the thread in state is not the selected one yet), so
  // the previous conversation's messages never flash under a new header.
  useEffect(() => {
    if (!selected) return undefined
    let active = true
    api
      .get(`/chats/${selected}/messages`, { params: { limit: PAGE } })
      .then((res) => {
        if (!active) return
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread({ id: selected, messages: res.data.messages, hasMore: res.data.hasMore, loading: false, error: '' })
        markRead(selected)
      })
      .catch((err) => active && setThread({ id: selected, messages: [], hasMore: false, loading: false, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [selected, markRead])

  async function loadEarlier() {
    const oldest = thread.messages[0]
    if (!oldest || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      const res = await api.get(`/chats/${selected}/messages`, { params: { before: oldest._id, limit: PAGE } })
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
  }, [thread.messages, thread.id])

  // ---- live messages -------------------------------------------------------
  useEffect(
    () =>
      subscribe((type, payload) => {
        if (type === 'resync') {
          loadList(1)
          if (selectedRef.current) loadThread(selectedRef.current)
          return
        }
        const { conversationId, message } = payload
        const open = conversationId === selectedRef.current
        setList((prev) => {
          if (!prev.items.some((c) => c._id === conversationId)) return prev
          const updated = prev.items.map((c) =>
            c._id === conversationId
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
          if (!prev.items.some((c) => c._id === conversationId)) loadList(1)
          return prev
        })
        if (open) {
          scrollPlan.current = { mode: 'bottom', height: 0 }
          setThread((t) => (t.messages.some((m) => m._id === message._id) ? t : { ...t, messages: [...t.messages, message] }))
          if (!message.mine) markRead(conversationId)
        }
      }),
    [subscribe, loadList, loadThread, markRead],
  )

  // ---- sending -------------------------------------------------------------
  const current = list.items.find((c) => c._id === selected)
  const starting = !selected && Boolean(context)
  const counterpart = current?.with || (starting ? { name: context.brand.name, image: context.brand.logo } : null)
  const canSend = canReply && (starting || (current ? current.canSend : true))

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
        setThread({ id: res.data.conversationId, messages: [res.data.message], hasMore: false, loading: false, error: '' })
        // The product link has done its job: from here on this is just the thread.
        setParams({ c: res.data.conversationId }, { replace: true })
        setContext(null)
      } else {
        const res = await api.post(`/chats/${selected}/messages`, { body, ...(attach && { productId: attach._id }) })
        scrollPlan.current = { mode: 'bottom', height: 0 }
        setThread((t) => (t.messages.some((m) => m._id === res.data.message._id) ? t : { ...t, messages: [...t.messages, res.data.message] }))
        if (attach) setParams({ c: selected }, { replace: true })
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

  const open = (id) => setParams({ c: id })
  const back = () => setParams({})
  const threadOpen = Boolean(selected || starting)

  // ---- render --------------------------------------------------------------
  const threadReady = starting || thread.id === selected
  const messages = threadReady ? thread.messages : []
  const rows = messages.map((m, i) => ({ m, divider: i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt) }))

  return (
    <div className="grid h-[calc(100dvh-11rem)] min-h-[460px] overflow-hidden rounded-lg border border-line bg-white md:grid-cols-[320px_1fr]">
      {/* Conversations */}
      <aside className={`min-h-0 flex-col border-line md:flex md:border-r ${threadOpen ? 'hidden' : 'flex'}`} aria-label="Conversations">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.loading ? (
            <div className="p-5">
              <Spinner label="Loading conversations…" />
            </div>
          ) : list.error ? (
            <p className="p-5 text-sm text-clay">{list.error}</p>
          ) : list.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <MessageCircle className="h-8 w-8 text-muted/50" aria-hidden="true" />
              <p className="mt-3 font-display text-lg font-semibold text-ink">No conversations yet</p>
              <p className="mt-1 text-[13px] text-muted">
                {isBrand ? 'When a customer messages your brand, it shows up here.' : 'Open a product and choose “Chat with seller” to ask a question.'}
              </p>
              {!isBrand && (
                <Link to="/shop" className="mt-4 text-[13px] font-medium text-clay underline">
                  Browse products
                </Link>
              )}
            </div>
          ) : (
            <ul>
              {list.items.map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => open(c._id)}
                    aria-current={c._id === selected}
                    className={`flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition hover:bg-paper ${c._id === selected ? 'bg-paper' : ''}`}
                  >
                    <Avatar name={c.with.name} image={c.with.image} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[14px] ${c.unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{c.with.name}</span>
                        <span className="shrink-0 text-[11px] text-muted">{listTime(c.lastMessageAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`truncate text-[13px] ${c.unread ? 'text-ink' : 'text-muted'}`}>
                          {c.lastSenderRole === mySide ? 'You: ' : ''}
                          {c.lastMessagePreview}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-clay px-1.5 text-[11px] font-semibold text-white">
                            {c.unread > 9 ? '9+' : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {list.page < list.pages && (
                <li className="p-3 text-center">
                  <button type="button" onClick={() => loadList(list.page + 1)} className="text-[13px] font-medium text-clay underline">
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
          <div className="hidden h-full flex-col items-center justify-center text-center md:flex">
            <MessageCircle className="h-9 w-9 text-muted/40" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted">{contextError || 'Choose a conversation to read it.'}</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button type="button" onClick={back} aria-label="Back to conversations" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-paper md:hidden">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              {counterpart && <Avatar name={counterpart.name} image={counterpart.image} size="h-9 w-9" />}
              <p className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold text-ink">{counterpart ? counterpart.name : ''}</p>
            </header>

            <div ref={scroller} role="log" aria-live="polite" aria-label="Messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!threadReady ? (
                <Spinner label="Loading messages…" />
              ) : thread.error ? (
                <p className="text-sm text-clay">{thread.error}</p>
              ) : (
                <>
                  {thread.hasMore && !starting && (
                    <div className="text-center">
                      <button type="button" onClick={loadEarlier} disabled={loadingEarlier} className="text-[13px] font-medium text-clay underline disabled:opacity-50">
                        {loadingEarlier ? 'Loading…' : 'Show earlier messages'}
                      </button>
                    </div>
                  )}
                  {starting && messages.length === 0 && (
                    <div className="mx-auto max-w-sm space-y-3 pt-4 text-center">
                      <p className="text-[13.5px] text-muted">Ask {context.brand.name} about this product. They usually reply in the chat.</p>
                      <ProductChip product={context.product} />
                    </div>
                  )}
                  {rows.map(({ m, divider }) => (
                    <div key={m._id} className="space-y-3">
                      {divider && <p className="text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{dayLabel(m.createdAt)}</p>}
                      <Bubble message={m} showSender={isBrand} />
                    </div>
                  ))}
                </>
              )}
            </div>

            <form onSubmit={onSend} className="border-t border-line p-3">
              {!canReply ? (
                <p className="px-1 py-2 text-[13px] text-muted">You can read messages, but you do not have permission to reply.</p>
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
                    <p role="alert" className="mb-2 rounded-md bg-clay/5 px-3 py-2 text-[13px] text-clay">
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
                      className="min-h-[44px] flex-1 resize-none rounded-md border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-ink"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="flex h-11 items-center gap-1.5 rounded-md bg-ink px-4 text-[13px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {draft.length > MAX_MESSAGE_LENGTH * 0.8 && (
                    <p className="mt-1 text-right text-[11px] text-muted">
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
