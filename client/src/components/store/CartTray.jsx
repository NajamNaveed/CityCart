import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import ProductImage from '../ProductImage'
import { useCart } from '../../hooks/useCart'
import { formatPrice } from '../../ui'

// width 420 is the URL the shelf tile already downloaded, so a thumbnail never
// shimmers over a photo the visitor has already seen.
const THUMB = 'h-11 w-11 overflow-hidden rounded-tile border border-line-warm bg-sand sm:h-12 sm:w-12'

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
 * The bag at the bottom of a store page, made of the things it holds: each
 * shelf item you add lands here as its own photo, and the count and subtotal
 * travel with it. Adding from a shelf never needs a trip to the navbar.
 *
 * The dock is anchored to the bottom and only fades — it never slides — so
 * flyToCart can measure a slot in the frame it appears in and hit it.
 */
export default function CartTray() {
  const { isCustomer, itemCount, subtotal, lines, flight } = useCart()
  const railRef = useRef(null)
  const slotsSeen = useRef(0)

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
  const visible = slots.length > 0

  return (
    <div
      data-cart-dock
      aria-hidden={!visible || undefined}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-4"
    >
      <div
        className={`mx-auto flex w-full max-w-[720px] items-center gap-2.5 rounded-panel border border-line-warm bg-paper-warm p-2 shadow-[0_16px_44px_rgba(21,20,15,0.18)] transition-opacity duration-200 sm:gap-3 sm:p-2.5 ${
          visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-sand text-noir sm:h-11 sm:w-11">
          <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none tabular-nums text-white">
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
          <span className="block font-display text-[14.5px] font-semibold text-ink">{formatPrice(subtotal)}</span>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/45">
            {itemCount === 1 ? '1 item' : `${itemCount} items`}
          </span>
        </span>

        <Link
          to="/cart"
          aria-label="View cart"
          tabIndex={visible ? 0 : -1}
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-clay text-white transition-colors hover:bg-clay-dark sm:w-auto sm:px-4"
        >
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.1em] sm:inline">View cart</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
