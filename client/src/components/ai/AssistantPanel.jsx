import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight,
  ChefHat,
  Minus,
  Package,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  Wrench,
} from 'lucide-react'

import api, { getErrorMessage } from '../../services/api'
import { useCity } from '../../hooks/useCity'
import { useCart } from '../../hooks/useCart'
import { useNearby } from '../../hooks/useNearby'
import { Badge } from '../../design'
import StatusPill from '../StatusPill'
import Drawer from '../ui/Drawer'
import VoiceSearchButton from '../ui/VoiceSearchButton'
import { formatDate, formatPrice } from '../../ui'
import { formatDistance } from '../../utils/geo'
import { ASSISTANT_OPEN_EVENT, setAssistantAvailable } from './assistantBus'

// One chat, one endpoint: the server reads the message and picks the same
// scoped agent a mode button used to select (docs/29 Phase 2g). These rows are
// hints, not filters — every example is sent to the same /ai/chat route.
const CAPABILITIES = [
  {
    mode: 'shop',
    label: 'Products',
    icon: ShoppingBag,
    example: 'Cheap rice nearby',
  },
  {
    mode: 'order',
    label: 'Orders',
    icon: Package,
    example: 'Where is my order?',
  },
  {
    mode: 'service',
    label: 'Services',
    icon: Wrench,
    example: 'AC repair tomorrow evening',
  },
  {
    mode: 'recipe',
    label: 'Recipe list',
    icon: ChefHat,
    example: 'Chicken biryani for 6',
  },
  {
    mode: 'compare',
    label: 'Compare',
    icon: ArrowLeftRight,
    example: 'Compare rice brands',
  },
]

const MODE_LABELS = {
  shop: 'Shopping',
  order: 'Orders',
  service: 'Services',
  recipe: 'Recipe',
  compare: 'Compare',
  help: 'Assistant',
}

// Used only when the server could not soften a provider failure, exactly like
// the per-mode fallbacks did before the chat was merged.
const FALLBACKS = {
  shop: 'Showing matches without the assistant.',
  order: 'Here are your latest orders.',
  service: 'Here are service providers near you.',
  recipe: 'Here are products matching your words.',
  compare: 'Showing the closest matches.',
}

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

function providerCard(provider) {
  const distance = provider.distanceKm ?? null
  return (
    <Link
      key={provider.providerId}
      to={`/services/${provider.slug}`}
      className="block rounded-tile border border-line-warm bg-paper p-3 transition hover:border-forest/30 hover:bg-paper-warm"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold text-ink">
            {provider.displayName}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink/55">
            {[
              provider.categoryName,
              provider.blockName,
              distance !== null ? `${formatDistance(distance)} away` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-right text-[11.5px]">
          {provider.isNew ? (
            <span className="font-medium text-ink/50">New</span>
          ) : provider.ratingAvg ? (
            <span className="font-semibold text-ink">
              {Number(provider.ratingAvg).toFixed(1)} ★{' '}
              <span className="font-normal text-ink/45">({provider.ratingCount})</span>
            </span>
          ) : null}
        </span>
      </div>
      {provider.startingAtPrice != null && (
        <p className="mt-1.5 text-[11.5px] text-ink/55">
          From <span className="font-semibold text-ink">{formatPrice(provider.startingAtPrice / 100)}</span>
        </p>
      )}
      {(provider.offerings || []).length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-line-warm pt-2">
          {provider.offerings.map((offering) => {
            const slots = offering.slots || []
            return (
              <div key={offering.offeringId} className="text-[11.5px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-ink/75">{offering.title}</span>
                  <span className="shrink-0 text-[10.5px] text-ink/45">
                    {offering.durationMinutes} min · from {formatPrice(offering.startingAtPrice / 100)}
                  </span>
                </div>
                {slots.length > 0 && (
                  <p className="mt-0.5 text-[10.5px] font-medium text-forest">
                    Free: {slots.slice(0, 2).map((slot) => slot.label).join(' · ')}
                    {slots.length > 2 ? ` +${slots.length - 2} more` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Link>
  )
}

// The recipe shopping list (Phase 2d). Every row with a product came from a
// real product search; nothing is added until the customer presses the button,
// and it goes through the normal cart API.
function RecipeCard({ entry }) {
  const { addItem } = useCart()
  const matched = entry.items.filter((item) => item.product)
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(matched.map((item) => [item.product._id, 1])),
  )
  const [adding, setAdding] = useState(false)
  const [result, setResult] = useState(null)

  const estimate = matched.reduce(
    (sum, item) => sum + item.product.price * (quantities[item.product._id] || 1),
    0,
  )

  function step(productId, delta) {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.min(10, Math.max(1, (current[productId] || 1) + delta)),
    }))
  }

  async function addAll() {
    if (adding || matched.length === 0) return
    setAdding(true)
    setResult(null)
    let added = 0
    const failed = []
    for (const item of matched) {
      try {
        await addItem(item.product._id, quantities[item.product._id] || 1)
        added += 1
      } catch {
        failed.push(item.ingredient)
      }
    }
    setAdding(false)
    setResult({ added, failed })
  }

  return (
    <div className="rounded-tile border border-line-warm bg-paper">
      <div className="border-b border-line-warm px-3 py-2.5">
        <p className="text-[12.5px] font-semibold text-ink">
          Shopping list{entry.title ? ` · ${entry.title}` : ''}
        </p>
        <p className="mt-0.5 text-[11px] text-ink/50">
          {matched.length} of {entry.items.length} ingredients matched to products nearby
        </p>
      </div>

      <div className="divide-y divide-line-warm/70">
        {entry.items.map((item) => (
          <div key={`${item.ingredient}-${item.product?._id || 'none'}`} className="flex items-center gap-2.5 px-3 py-2">
            {item.product ? (
              <>
                {item.product.image ? (
                  <img
                    src={item.product.image}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded-md bg-canvas" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <Link
                    to={`/product/${item.product._id}`}
                    className="block truncate text-[12.5px] font-medium text-ink transition hover:text-forest"
                  >
                    {item.product.name}
                  </Link>
                  <span className="block truncate text-[11px] text-ink/50">
                    {[item.ingredient, item.quantity, item.product.brandName].filter(Boolean).join(' · ')}
                  </span>
                  <span className="block text-[11.5px] font-semibold text-ink">
                    {formatPrice(item.product.price)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center rounded-full border border-line-warm">
                  <button
                    type="button"
                    onClick={() => step(item.product._id, -1)}
                    disabled={adding}
                    aria-label={`Less ${item.product.name}`}
                    className="px-2 py-1 text-ink/60 transition hover:text-ink disabled:opacity-40"
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <span className="min-w-4 text-center text-[11.5px] font-semibold text-ink">
                    {quantities[item.product._id] || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => step(item.product._id, 1)}
                    disabled={adding}
                    aria-label={`More ${item.product.name}`}
                    className="px-2 py-1 text-ink/60 transition hover:text-ink disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink/55">
                  {[item.ingredient, item.quantity].filter(Boolean).join(' · ')}
                </span>
                <span className="block text-[11px] text-ink/40">Not found nearby</span>
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line-warm px-3 py-2.5">
        <span className="text-[11.5px] text-ink/55">{formatPrice(estimate)} estimated</span>
        <button
          type="button"
          onClick={addAll}
          disabled={adding || matched.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-[11.5px] font-semibold text-cream transition hover:bg-forest/90 disabled:opacity-40"
        >
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
          {adding ? 'Adding…' : 'Add all to cart'}
        </button>
      </div>

      {result && (
        <p className="border-t border-line-warm px-3 py-2 text-[11px] leading-relaxed text-ink/55" role="status">
          {result.added > 0 && `Added ${result.added} ${result.added === 1 ? 'item' : 'items'} to your cart. `}
          {result.failed.length > 0 && `Could not add: ${result.failed.join(', ')}. `}
          {result.added > 0 && (
            <Link to="/cart" className="font-semibold text-forest underline-offset-4 hover:underline">
              View cart
            </Link>
          )}
        </p>
      )}

      <p className="px-3 pb-2 text-[10.5px] text-ink/40">
        AI can make mistakes — check each item before ordering.
      </p>
    </div>
  )
}

function availabilityLabel(value) {
  if (value === 'OUT_OF_STOCK') return 'Sold out'
  if (value === 'LOW_STOCK') return 'Low stock'
  return 'In stock'
}

function ratingLabel(rating) {
  if (!rating || !rating.count) return '—'
  return `${Number(rating.average).toFixed(1)} ★ (${rating.count})`
}

function CompareRow({ label, children }) {
  return (
    <tr>
      <th
        scope="row"
        className="p-2 text-left align-top text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink/45"
      >
        {label}
      </th>
      {children}
    </tr>
  )
}

// Side-by-side comparison (Phase 2e). Every value comes from the server's
// enriched tool results; the only thing computed here is the lowest price.
function CompareCard({ products }) {
  const lowest = Math.min(...products.map((product) => product.price))
  const attributeKeys = [
    ...new Set(products.flatMap((product) => Object.keys(product.attributes || {}))),
  ].slice(0, 8)

  return (
    <div>
      <div className="overflow-x-auto rounded-tile border border-line-warm bg-paper">
        <table className="w-full min-w-[340px] border-collapse text-left text-[11.5px]">
          <thead>
            <tr>
              <th scope="col" className="w-14" aria-label="Detail" />
              {products.map((product) => (
                <th
                  key={product._id}
                  scope="col"
                  className="border-l border-line-warm p-2 align-top font-normal"
                >
                  <Link to={`/product/${product._id}`} className="block">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt=""
                        className="mb-1.5 h-14 w-14 rounded-md object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="mb-1.5 block h-14 w-14 rounded-md bg-canvas" aria-hidden="true" />
                    )}
                    <span className="line-clamp-2 block text-[11.5px] font-semibold leading-snug text-ink transition hover:text-forest">
                      {product.name}
                    </span>
                  </Link>
                  <span className="mt-0.5 block truncate text-[10.5px] text-ink/50">
                    {product.brandName}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-warm/70">
            <CompareRow label="Price">
              {products.map((product) => (
                <td key={product._id} className="border-l border-line-warm p-2 align-top">
                  <span className="block font-semibold text-ink">{formatPrice(product.price)}</span>
                  {product.compareAtPrice > product.price && (
                    <span className="block text-[10.5px] text-muted line-through">
                      {formatPrice(product.compareAtPrice)}
                    </span>
                  )}
                  {products.length > 1 && product.price === lowest && (
                    <span className="mt-0.5 inline-block rounded-full bg-sage px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-forest">
                      Lowest
                    </span>
                  )}
                </td>
              ))}
            </CompareRow>
            <CompareRow label="Stock">
              {products.map((product) => (
                <td key={product._id} className="border-l border-line-warm p-2 align-top text-ink/75">
                  {availabilityLabel(product.availability)}
                </td>
              ))}
            </CompareRow>
            <CompareRow label="Rating">
              {products.map((product) => (
                <td key={product._id} className="border-l border-line-warm p-2 align-top text-ink/75">
                  {ratingLabel(product.rating)}
                </td>
              ))}
            </CompareRow>
            {attributeKeys.map((key) => (
              <CompareRow key={key} label={key}>
                {products.map((product) => (
                  <td key={product._id} className="border-l border-line-warm p-2 align-top text-ink/75">
                    {product.attributes?.[key] ?? '—'}
                  </td>
                ))}
              </CompareRow>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10.5px] text-ink/40">
        Live listings — prices and stock can change. Open a product to check before ordering.
      </p>
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
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState([])
  const endRef = useRef(null)
  const inputRef = useRef(null)
  // The previous tool mode is a hint for short follow-ups ("cancel it"). The
  // server still makes the routing decision and validates this value.
  const lastModeRef = useRef(null)

  useEffect(() => {
    let activeProbe = true
    api
      .post('/ai/ping')
      .then(() => {
        if (!activeProbe) return
        setAvailable(true)
        setAssistantAvailable(true)
      })
      .catch(() => {
        if (!activeProbe) return
        setAvailable(false)
        setAssistantAvailable(false)
      })
    return () => {
      activeProbe = false
    }
  }, [])

  // A page (for example the product page's Compare button) can open the
  // drawer with a prefilled question; sending stays the customer's action.
  // When AI is off the drawer is not rendered, so there is no button to reach
  // this either.
  useEffect(() => {
    function onOpen(event) {
      if (!available) return
      const { message } = event.detail || {}
      if (message) setInput(message)
      setOpen(true)
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen)
  }, [available])

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
      const { data } = await api.post('/ai/chat', {
        message,
        ...(cityId && { cityId }),
        ...(coords && { lat: coords.lat, lng: coords.lng }),
        ...(lastModeRef.current && { lastMode: lastModeRef.current }),
      })
      const answer = data.data || {}
      const mode = answer.mode || 'shop'
      if (mode !== 'help') lastModeRef.current = mode
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: 'assistant',
          mode,
          text: answer.reply || FALLBACKS[mode] || 'Sorry, I could not put that into words.',
          products: answer.products || [],
          orders: answer.orders || [],
          providers: answer.providers || [],
          title: answer.title || null,
          items: answer.items || [],
          hints: answer.hints || [],
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
            ? 'The assistant is off right now. You can still search from Stores or Services.'
            : getErrorMessage(err, 'The assistant could not answer just now.'),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  if (!available) return null

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
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-ink/45">
              One chat — I pick the right helper for your question.
            </p>
            <Badge tone="sage">AI</Badge>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pb-3">
            {messages.length === 0 && (
              <div className="rounded-tile border border-line-warm bg-paper-warm p-4">
                <p className="text-[13px] leading-relaxed text-ink/70">
                  Ask anything about CityCart. I can:
                </p>
                <ul className="mt-3 space-y-1.5">
                  {CAPABILITIES.map(({ mode: key, label, icon: Icon, example }) => (
                    <li key={key} className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-forest" aria-hidden="true" />
                      <span className="w-[74px] shrink-0 text-[11.5px] font-medium text-ink/65">
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => send(example)}
                        className="min-w-0 flex-1 truncate rounded-full border border-line-warm bg-paper px-2.5 py-1 text-left text-[11.5px] text-ink/75 transition hover:border-forest/30 hover:text-ink"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[10.5px] leading-relaxed text-ink/40">
                  English, Urdu or Roman Urdu — no need to pick a mode. Answers use real listings,
                  your own orders and live availability.
                </p>
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
                  {!entry.error && MODE_LABELS[entry.mode] && (
                    <span className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink/35">
                      {MODE_LABELS[entry.mode]}
                    </span>
                  )}
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
                  {entry.mode === 'help' && entry.hints?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.hints.map((hint) => (
                        <button
                          key={hint}
                          type="button"
                          onClick={() => send(hint)}
                          className="rounded-full border border-line-warm bg-paper px-2.5 py-1 text-[11px] text-ink/70 transition hover:border-forest/30 hover:text-ink"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  )}
                  {entry.items?.length > 0 && <RecipeCard entry={entry} />}
                  {entry.mode === 'compare' && entry.products?.length > 0 ? (
                    <CompareCard products={entry.products} />
                  ) : (
                    entry.products?.length > 0 && (
                      <div className="space-y-1.5">{entry.products.map(productCard)}</div>
                    )
                  )}
                  {entry.orders?.length > 0 && (
                    <div className="space-y-1.5">{entry.orders.map(orderCard)}</div>
                  )}
                  {entry.providers?.length > 0 && (
                    <div className="space-y-1.5">{entry.providers.map(providerCard)}</div>
                  )}
                  {(entry.products?.length > 0 ||
                    entry.orders?.length > 0 ||
                    entry.providers?.length > 0) && (
                    <p className="text-[10.5px] text-ink/40">
                      {entry.degraded ? 'Plain search results. ' : ''}AI can make mistakes —{' '}
                      {entry.providers?.length > 0
                        ? 'confirm the time and price on the provider page.'
                        : `check the ${entry.orders?.length > 0 ? 'order' : 'listing'} before acting.`}
                    </p>
                  )}
                </div>
              )
            )}

            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-ink/50" aria-live="polite">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest" />
                Thinking…
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
              placeholder="Ask about products, orders, services or recipes"
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-tile border border-line-warm bg-paper px-3 py-2.5 text-[13px] text-ink outline-none focus:border-forest/50"
            />
            <VoiceSearchButton
              className="relative self-center"
              label="Ask by voice"
              onResult={(text) => {
                setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
                inputRef.current?.focus()
              }}
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
