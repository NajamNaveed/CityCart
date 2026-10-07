import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

function monogram(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/**
 * One brand card in the marquee. The monogram circle replaces the old giant
 * letter tile; logo brands keep their logo.
 */
function BrandCard({ brand, duplicate = false }) {
  return (
    <Link
      data-brand-card
      to={`/shop?brandId=${brand._id}`}
      tabIndex={duplicate ? -1 : undefined}
      aria-hidden={duplicate || undefined}
      className="group flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm shadow-ink/5 transition-colors duration-300 hover:border-ink/30"
    >
      <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-cream via-sand to-paper">
        <div
          aria-hidden="true"
          className="absolute h-32 w-32 rounded-full bg-white/40 blur-2xl"
        />
        {brand.logo ? (
          <img src={brand.logo} alt="" className="relative max-h-20 max-w-[65%] object-contain" />
        ) : (
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white font-display text-[22px] font-semibold text-clay shadow-md shadow-ink/10">
            {monogram(brand.name)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <p className="truncate text-[14px] font-semibold text-ink">{brand.name}</p>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-clay"
          aria-hidden="true"
        />
      </div>
    </Link>
  )
}

// px per animation frame: ~30 px/s — a slow, premium drift.
const SPEED = 0.5
// How strongly cards shrink away from the center (0.14 = max 14% smaller).
const SHRINK = 0.14
// After this much silence (ms) since the last interaction, the drift resumes.
const INTERACTION_GRACE = 1200

/**
 * Endless brand carousel. The set is duplicated enough times to overfill the
 * viewport, and the scroll position wraps by exactly one set width, so the
 * loop never shows a seam — in either direction.
 *
 * It drifts right-to-left on its own and pauses while you are on it, but it
 * is also a real scrollable strip: swipe on touch, drag with the mouse, or
 * wheel across it. The scrollbar stays hidden. Cards nearest the middle grow,
 * the rest ease down. prefers-reduced-motion keeps the strip still and plain.
 */
export default function BrandMarquee({ brands }) {
  const containerRef = useRef(null)
  const setRef = useRef(null)
  const lastInteractRef = useRef(0)
  const hoverRef = useRef(false)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [copies, setCopies] = useState(2)

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current
      const set = setRef.current
      if (!container || !set) return
      setCopies(Math.max(2, Math.ceil(container.clientWidth / set.offsetWidth) + 1))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [brands])

  const markInteraction = () => {
    lastInteractRef.current = Date.now()
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    container.scrollLeft = 1 // room to drag backwards from the start

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf
    const step = () => {
      const set = setRef.current
      if (set) {
        const setWidth = set.offsetWidth
        if (setWidth > 0) {
          // Keep the position inside the first copy — invisible, since the
          // next copy is pixel-identical. While a drag is active the pointer
          // handler owns the wrap (it rebalances its own baseline).
          if (!dragRef.current) {
            if (container.scrollLeft >= setWidth) {
              container.scrollLeft -= setWidth
            } else if (container.scrollLeft <= 0) {
              container.scrollLeft += setWidth
            }
          }
          const idle = Date.now() - lastInteractRef.current > INTERACTION_GRACE
          if (!reduce && !hoverRef.current && !dragRef.current && idle) {
            container.scrollLeft += SPEED
          }
        }
      }

      // Read every card's position first, then write the scales.
      const center = container.getBoundingClientRect().left + container.clientWidth / 2
      const cards = [...container.querySelectorAll('[data-brand-card]')]
      const scales = cards.map((card) => {
        const rect = card.getBoundingClientRect()
        const distance = Math.abs(rect.left + rect.width / 2 - center)
        return 1 - SHRINK * Math.min(distance / (container.clientWidth * 0.45), 1)
      })
      if (!reduce) {
        cards.forEach((card, i) => {
          card.style.transform = `scale(${scales[i]})`
        })
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [brands, copies])

  return (
    <div className="relative">
      {/* Edge fades so cards dissolve at both ends of the viewport */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent" />

      <div
        ref={containerRef}
        className="cursor-grab select-none overflow-x-auto overflow-y-hidden py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden active:cursor-grabbing"
        onMouseEnter={() => {
          hoverRef.current = true
        }}
        onMouseLeave={() => {
          hoverRef.current = false
        }}
        onWheel={markInteraction}
        onTouchStart={markInteraction}
        onTouchMove={markInteraction}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return // touch scrolls natively
          dragRef.current = { startX: e.clientX, startLeft: containerRef.current.scrollLeft, moved: false }
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current
          if (!drag) return
          const dx = e.clientX - drag.startX
          if (Math.abs(dx) > 4) {
            drag.moved = true
            markInteraction()
          }
          const container = containerRef.current
          container.scrollLeft = drag.startLeft - dx
          // The drag owns wrapping while it is active, rebalancing its
          // baseline so the position math stays continuous across the seam.
          const set = setRef.current
          const setWidth = set ? set.offsetWidth : 0
          if (setWidth > 0) {
            if (container.scrollLeft >= setWidth) {
              container.scrollLeft -= setWidth
              drag.startLeft -= setWidth
            } else if (container.scrollLeft <= 0) {
              container.scrollLeft += setWidth
              drag.startLeft += setWidth
            }
          }
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current
          if (!drag) return
          suppressClickRef.current = drag.moved
          dragRef.current = null
          markInteraction()
          // Release capture semantics differ per browser; clear the flag shortly after.
          setTimeout(() => {
            suppressClickRef.current = false
          }, 0)
          if (e.pointerType !== 'mouse') return
        }}
        onClickCapture={(e) => {
          // A drag is not a click: don't navigate when the mouse let go over a card.
          if (suppressClickRef.current) {
            e.preventDefault()
            e.stopPropagation()
            suppressClickRef.current = false
          }
        }}
      >
        <div className="flex w-max">
          {Array.from({ length: copies }, (_, s) => (
            <div key={s} ref={s === 0 ? setRef : null} className="flex gap-5 pr-5">
              {brands.map((brand) => (
                <BrandCard key={`${s}-${brand._id}`} brand={brand} duplicate={s > 0} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
