import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import ProductImage from '../ProductImage'
import { useCart } from '../../hooks/useCart'
import { formatPrice } from '../../ui'

// How long the dock stays after the last cart change before it tucks itself
// away. Pointer or keyboard use keeps it up for another window.
const IDLE_MS = 6000

// width 420 is the URL the shelf tile already downloaded, so a thumbnail never
// shimmers over a photo the visitor has already seen.
const THUMB =
  'h-11 w-11 overflow-hidden rounded-tile border border-line-warm bg-sand shadow-[0_6px_14px_-10px_rgba(21,20,15,0.6)] sm:h-12 sm:w-12'

function Thumb({ productId, image, name, quantity, dimmed = false }) {
  return (
    <div
      data-cart-line={String(productId)}
      title={name}
      className={`relative shrink-0 transition-opacity duration-200 ${dimmed ? 'opacity-25' : 'opacity-100'}`}
    >
      <div className={THUMB}>
        <ProductImage src={image} name={name} className="h-full w-full" width={420} />
      </div>
      <span
        key={quantity}
        className="absolute -right-1 -top-1 flex h-4 min-w-4 animate-[cart-badge_220ms_ease-out] items-center justify-center rounded-full bg-noir px-1 text-[10px] font-semibold leading-none tabular-nums text-cream"
      >
        {quantity}
      </span>
    </div>
  )
}

/**
 * The bag at the bottom of a shop page, made of the things it holds: each
 * shelf item you add lands here as its own photo, and the count and subtotal
 * travel with it. Adding from a shelf never needs a trip to the navbar.
 *
 * It surfaces on any cart change and fades away after a quiet spell, so it
 * never sits on top of the last row of products for good. Hovering or tabbing
 * into it counts as activity and keeps it around.
 *
 * The dock is portalled to the body and only fades — it never slides — so no
 * page transform can drag it along and flyToCart can measure an exact slot.
 */
export default function CartTray() {
  const { isCustomer, itemCount, subtotal, lines, flight } = useCart()
  const railRef = useRef(null)
  const slotsSeen = useRef(0)
  const timerRef = useRef(null)
  const [active, setActive] = useState(false)
  const [hovering, setHovering] = useState(false)

  const arm = useCallback(() => {
    setActive(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setActive(false), IDLE_MS)
  }, [])

  // Every add, step or removal re-surfaces the dock; an empty cart tucks it.
  useEffect(() => {
    if (itemCount > 0) arm()
    else setActive(false)
  }, [itemCount, arm])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  // The item flying in is already given a slot; the one flying out keeps its
  // slot, dimmed, until the server agrees it is gone.
  const arriving =
    flight?.direction === 'in' && !lines.some((line) => String(line.productId) === String(flight.productId))
      ? flight
      : null
  const leavingId = flight?.direction === 'out' ? String(flight.productId) : ''
  const slots = arriving
    ? [...lines, { productId: arriving.productId, name: arriving.name, image: arriving.image, quantity: 1 }]
    : lines

  // A new slot is off-screen to the right, so the photo that lands in it would
  // otherwise fly into a thumbnail nobody can see.
  useLayoutEffect(() => {
    const rail = railRef.current
    if (rail && slots.length > slotsSeen.current) rail.scrollLeft = rail.scrollWidth
    slotsSeen.current = slots.length
  }, [slots.length])

  if (!isCustomer) return null

  const visible = slots.length > 0 && (active || hovering)

  return createPortal(
    <div
      data-cart-dock
      aria-hidden={!visible || undefined}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4"
    >
      <div
        onPointerEnter={() => {
          setHovering(true)
          arm()
        }}
        onPointerLeave={() => {
          setHovering(false)
          arm()
        }}
        onFocusCapture={arm}
        className={`relative mx-auto flex w-full max-w-[720px] items-center gap-2.5 overflow-hidden rounded-[20px] border border-line-warm/90 bg-paper-warm/95 p-2 pl-2.5 shadow-[0_22px_54px_-20px_rgba(21,20,15,0.4)] ring-1 ring-ink/5 backdrop-blur-xl transition-opacity duration-300 sm:gap-3 sm:p-2.5 sm:pl-3 ${
          visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent"
        />
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-noir to-forest-deep text-cream shadow-[0_8px_18px_-10px_rgba(21,20,15,0.9)] sm:h-11 sm:w-11">
          <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none tabular-nums text-white shadow-sm">
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        </span>

        <div
          ref={railRef}
          role="group"
          aria-label="Items in your bag"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slots.map((line) => (
            <Thumb
              key={String(line.productId)}
              productId={line.productId}
              image={line.image}
              name={line.name}
              quantity={line.quantity}
              dimmed={String(line.productId) === leavingId}
            />
          ))}
        </div>

        <span className="shrink-0 text-right leading-tight">
          <span className="block font-display text-[15px] font-semibold tracking-tight text-ink">
            {formatPrice(subtotal)}
          </span>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/45">
            {itemCount === 1 ? '1 item' : `${itemCount} items`}
          </span>
        </span>

        <Link
          to="/cart"
          aria-label="View cart"
          tabIndex={visible ? 0 : -1}
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-clay to-clay-dark text-white shadow-[0_10px_20px_-12px_rgba(182,71,42,0.9)] transition hover:brightness-110 sm:w-auto sm:px-4"
        >
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.1em] sm:inline">
            View cart
          </span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>,
    document.body,
  )
}
