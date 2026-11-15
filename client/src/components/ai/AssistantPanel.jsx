import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Sparkles } from 'lucide-react'

import api, { getErrorMessage } from '../../services/api'
import { useCity } from '../../hooks/useCity'
import { useNearby } from '../../hooks/useNearby'
import { Badge } from '../../design'
import StatusPill from '../StatusPill'
import Drawer from '../ui/Drawer'
import { formatDate, formatPrice } from '../../ui'

// Each mode posts the same body to its own endpoint; the server decides what a
// mode may read (docs/29 Phase 2).
const MODES = [
  {
    key: 'shop',
    label: 'Find products',
    endpoint: '/ai/shop-assistant',
    placeholder: 'What are you looking for? e.g. cheap rice',
    intro: 'Ask for a product, a price or a shop around you. Answers use real listings and never invent products.',
    suggestions: ['Cheap rice', 'Gift under 3000', 'Milk nearby'],
    withArea: true,
  },
  {
    key: 'order',
    label: 'My orders',
    endpoint: '/ai/order-helper',
    placeholder: 'e.g. Where is my order?',
    intro: 'Ask about your own orders, delivery, cancellation or returns. The assistant can only read your orders.',
    suggestions: ['Where is my order?', 'How do I cancel an order?', 'Can I return an item?'],
    withArea: false,
  },
]

let nextId = 1

function productCard(product) {
  return (
    <Link
      key={product._id}
      to={`/product/${product._id}`}
      className="flex items-center gap-3 rounded-tile border border-line-warm bg-paper px-2.5 py-2 transition hover:border-forest/30 hover:bg-paper-warm"
    >
      {product.image ? (
        <img
          src={product.image}
          alt=""
          className="h-11 w-11 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <span className="h-11 w-11 shrink-0 rounded-md bg-canvas" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{product.name}</span>
        <span className="block truncate text-[11.5px] text-ink/55">{product.brandName}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] font-semibold text-ink">{formatPrice(product.price)}</span>
        {product.availability === 'LOW_STOCK' && (
          <span className="text-[10.5px] font-medium text-clay">Low stock</span>
        )}
      </span>
    </Link>
  )
}

function orderCard(order) {
  return (
    <div key={order.orderId} className="rounded-tile border border-line-warm bg-paper p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <Link
            to={`/orders/${order.orderId}`}
            className="text-[12.5px] font-semibold text-ink transition hover:text-forest"
          >
            {order.orderNumber}
          </Link>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink/55">
            {[
              order.brandName,
              `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'}`,
              formatDate(order.placedAt),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <StatusPill value={order.orderStatus} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">
          {formatPrice(order.netTotal ?? order.total)}
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {(order.actions || []).map((action) => (
            <Link
              key={`${order.orderId}-${action.type}`}
              to={`/orders/${order.orderId}`}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                action.type === 'cancel_order'
                  ? 'border border-clay/25 bg-clay/5 text-clay hover:bg-clay/10'
                  : 'border border-line-warm bg-paper-warm text-ink/70 hover:border-forest/30 hover:text-ink'
              }`}
            >
              {action.label}
            </Link>
          ))}
        </span>
      </div>
    </div>
  )
}

/**
 * The customer assistant (docs/29 Phase 2). It stays hidden when AI is off:
 * a signed-in customer's first visit probes /ai/ping, which never spends the
 * daily allowance, and a 503 removes the launcher.
 */
export default function AssistantPanel() {
  const { cityId } = useCity()
  const { coords } = useNearby()
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(MODES[0].key)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState([])
  const endRef = useRef(null)
  const inputRef = useRef(null)

  const active = useMemo(() => MODES.find((item) => item.key === mode) || MODES[0], [mode])

  useEffect(() => {
    let activeProbe = true
    api
      .post('/ai/ping')
      .then(() => activeProbe && setAvailable(true))
      .catch(() => activeProbe && setAvailable(false))
    return () => {
      activeProbe = false
    }
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, busy])

  async function send(text) {
    const message = text.trim()
    if (!message || busy) return
    setMessages((prev) => [...prev, { id: nextId++, role: 'user', text: message }])
    setInput('')
    setBusy(true)
    try {
      const { data } = await api.post(active.endpoint, {
        message,
        ...(active.withArea && cityId && { cityId }),
        ...(active.withArea && coords && { lat: coords.lat, lng: coords.lng }),
      })
      const answer = data.data || {}
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: 'assistant',
          text:
            answer.reply ||
            (active.withArea ? 'Showing matches without the assistant.' : 'Here are your latest orders.'),
          products: answer.products || [],
          orders: answer.orders || [],
          degraded: Boolean(answer.degraded),
        },
      ])
    } catch (err) {
      const off = err.response?.status === 503
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: 'assistant',
          error: true,
          text: off
            ? 'The assistant is off right now. You can still search from Stores.'
            : getErrorMessage(err, 'The assistant could not answer just now.'),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!available) return null

  function changeMode(key) {
    if (key === mode) return
    setMode(key)
    setMessages([])
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-noir px-4 py-3 text-[13px] font-semibold text-cream shadow-xl shadow-noir/25 transition hover:bg-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
        aria-label="Ask CityCart assistant"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Ask CityCart
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Ask CityCart" width="max-w-md">
        <div className="flex h-full flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => changeMode(item.key)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  item.key === active.key
                    ? 'bg-forest text-cream'
                    : 'border border-line-warm bg-paper text-ink/70 hover:bg-paper-warm'
                }`}
              >
                {item.label}
              </button>
            ))}
            <Badge tone="sage" className="ml-auto">
              AI
            </Badge>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pb-3">
            {messages.length === 0 && (
              <div className="rounded-tile border border-line-warm bg-paper-warm p-4">
                <p className="text-[13px] leading-relaxed text-ink/70">
                  {active.intro}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {active.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-full border border-line-warm bg-paper px-3 py-1.5 text-[12px] text-ink/75 transition hover:border-forest/30 hover:text-ink"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((entry) =>
              entry.role === 'user' ? (
                <div key={entry.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-noir px-3.5 py-2.5 text-[13px] leading-relaxed text-cream">
                    {entry.text}
                  </p>
                </div>
              ) : (
                <div key={entry.id} className="max-w-[92%] space-y-2">
                  <p
                    className={`rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      entry.error
                        ? 'border-clay/25 bg-clay/5 text-clay'
                        : 'border-line-warm bg-paper text-ink'
                    }`}
                    role={entry.error ? 'alert' : undefined}
                  >
                    {entry.text}
                  </p>
                  {entry.products?.length > 0 && (
                    <div className="space-y-1.5">{entry.products.map(productCard)}</div>
                  )}
                  {entry.orders?.length > 0 && (
                    <div className="space-y-1.5">{entry.orders.map(orderCard)}</div>
                  )}
                  {(entry.products?.length > 0 || entry.orders?.length > 0) && (
                    <p className="text-[10.5px] text-ink/40">
                      {entry.degraded ? 'Plain search results. ' : ''}AI can make mistakes — check the{' '}
                      {entry.orders?.length > 0 ? 'order' : 'listing'} before acting.
                    </p>
                  )}
                </div>
              )
            )}

            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-ink/50" aria-live="polite">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest" />
                {active.key === 'order' ? 'Checking your orders…' : 'Thinking…'}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-line-warm pt-3"
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Your question
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={500}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send(input)
                }
              }}
              placeholder={active.placeholder}
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-tile border border-line-warm bg-paper px-3 py-2.5 text-[13px] text-ink outline-none focus:border-forest/50"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-tile bg-forest text-cream transition disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </Drawer>
    </>
  )
}
