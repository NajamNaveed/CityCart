import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { useCity } from '../../hooks/useCity'

function monogram(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// Backdrop moods cycled by brand name, so neighbours never share one and the
// strip reads as a row of related-but-distinct shopfronts.
const BACKDROPS = [
  { base: 'bg-gradient-to-br from-cream via-sand to-paper', blobA: 'bg-clay/25', blobB: 'bg-white/70' },
  { base: 'bg-gradient-to-bl from-sand via-cream to-paper', blobA: 'bg-clay/20', blobB: 'bg-white/60' },
  { base: 'bg-gradient-to-tr from-paper via-cream to-sand', blobA: 'bg-clay/30', blobB: 'bg-white/50' },
]

function backdropFor(name = '') {
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return BACKDROPS[hash % BACKDROPS.length]
}

/**
 * One brand card in the marquee. The outer wrapper owns the centre-proximity
 * depth styles (scale, lift, dim, shadow) written every frame by the
 * marquee; the Link inside it owns the hover lift, so the two transforms
 * never fight.
 */
function BrandCard({ brand, cityName, duplicate = false }) {
  const backdrop = backdropFor(brand.name)
  return (
    <div data-brand-card className="w-72 shrink-0 will-change-transform">
      <Link
        to={`/shop?brandId=${brand._id}`}
        tabIndex={duplicate ? -1 : undefined}
        aria-hidden={duplicate || undefined}
        className="group flex h-[21.5rem] flex-col overflow-hidden rounded-2xl border border-line bg-white transition-colors duration-300 hover:border-ink/25"
      >
        <div className={`relative flex h-52 shrink-0 items-center justify-center overflow-hidden ${backdrop.base}`}>
          <div aria-hidden="true" className={`absolute -left-8 -top-10 h-40 w-40 rounded-full ${backdrop.blobA} blur-2xl`} />
          <div aria-hidden="true" className={`absolute -bottom-12 -right-6 h-44 w-44 rounded-full ${backdrop.blobB} blur-2xl`} />
          {brand.logo ? (
            <img
              src={brand.logo}
              alt=""
              className="relative max-h-20 max-w-[65%] object-contain drop-shadow-sm transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-clay/15 bg-white/95 font-display text-2xl font-semibold tracking-tight text-clay shadow-lg shadow-ink/10 transition-transform duration-500 group-hover:scale-105">
              {monogram(brand.name)}
            </span>
          )}
          {cityName && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[10.5px] font-semibold text-ink backdrop-blur-sm">
              <MapPin className="h-3 w-3 text-clay" aria-hidden="true" />
              {cityName}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
          <p className="font-display truncate text-[17px] font-semibold tracking-tight text-ink">{brand.name}</p>
          {brand.description && (
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{brand.description}</p>
          )}
          <div className="mt-auto flex items-center justify-between pt-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors duration-300 group-hover:text-ink">
              Visit shop
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition-all duration-300 group-hover:rotate-45 group-hover:border-clay group-hover:bg-clay group-hover:text-white">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}

// px per animation frame: ~30 px/s — a slow, premium drift.
const SPEED = 0.5
// Depth effect strength: cards shrink, sink and soften away from the
// centre, so the strip reads like a curved wall of shopfronts. (Opacity
// falls to 55% at the edges, written inline below.)
const SHRINK = 0.15
const LIFT = 8
// Per-frame easing toward the target depth: lower is silkier, higher snappier.
const EASE = 0.14
// After this much silence (ms) since the last interaction, the drift resumes.
const INTERACTION_GRACE = 1200

/**
 * Endless brand carousel. The set is duplicated enough times to overfill the
 * viewport, and the scroll position wraps by exactly one set width, so the
 * loop never shows a seam — in either direction.
 *
 * It drifts right-to-left on its own and pauses while you are on it, but it
 * is also a real scrollable strip: swipe on touch, drag with the mouse, or
 * wheel across it. The scrollbar stays hidden. Cards nearest the middle rise,
 * brighten, grow and cast a deeper shadow; every depth value is lerped
 * toward its target each frame so proximity changes glide instead of
 * stepping. prefers-reduced-motion keeps the strip still and plain.
 */
export default function BrandMarquee({ brands }) {
  const containerRef = useRef(null)
  const setRef = useRef(null)
  const lastInteractRef = useRef(0)
  const hoverRef = useRef(false)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [copies, setCopies] = useState(2)
  const { cities } = useCity()
  const cityName = Object.fromEntries(cities.map((c) => [String(c._id), c.name]))

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

      // Read every card's position first, then write the depth styles. Each
      // card's proximity glides toward its target (EASE) so resizing,
      // wrapping and scrolling all read as continuous motion.
      const center = container.getBoundingClientRect().left + container.clientWidth / 2
      const cards = [...container.querySelectorAll('[data-brand-card]')]
      const targets = cards.map((card) => {
        const rect = card.getBoundingClientRect()
        const distance = Math.abs(rect.left + rect.width / 2 - center)
        return 1 - Math.min(distance / (container.clientWidth * 0.44), 1)
      })
      if (!reduce) {
        cards.forEach((card, i) => {
          const current = card._depth ?? targets[i]
          const depth = current + (targets[i] - current) * EASE
          card._depth = depth
          card.style.transform = `translate3d(0, ${(-LIFT * depth).toFixed(2)}px, 0) scale(${(1 - SHRINK * (1 - depth)).toFixed(4)})`
          card.style.opacity = (0.55 + 0.45 * depth).toFixed(3)
          // Kept low (1-10): these compete with the sticky navbar's z-40 in
          // the root stacking context, and the cards must never paint above it.
          card.style.zIndex = Math.round(1 + depth * 9)
          card.style.boxShadow = `0 ${(14 * depth).toFixed(1)}px ${(28 * depth).toFixed(1)}px -12px rgba(2, 6, 23, ${(0.16 * depth).toFixed(3)})`
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-20 w-20 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-20 w-20 bg-gradient-to-l from-paper to-transparent" />

      <div
        ref={containerRef}
        className="cursor-grab select-none overflow-x-auto overflow-y-hidden py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden active:cursor-grabbing"
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
          const drag = { startX: e.clientX, startLeft: containerRef.current.scrollLeft, moved: false }
          dragRef.current = drag
          // The release can land off the strip or outside the window; finish
          // the drag at window level, else a missed pointerup leaves the
          // marquee thinking it is still dragging (and paused) forever.
          const finish = () => {
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
            if (dragRef.current !== drag) return
            suppressClickRef.current = drag.moved
            dragRef.current = null
            markInteraction()
            setTimeout(() => {
              suppressClickRef.current = false
            }, 0)
          }
          window.addEventListener('pointerup', finish)
          window.addEventListener('pointercancel', finish)
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
        onClickCapture={(e) => {
          // A drag is not a click: don't navigate when the mouse let go over a card.
          if (suppressClickRef.current) {
            e.preventDefault()
            e.stopPropagation()
            suppressClickRef.current = false
          }
        }}
      >
        <div className="flex w-max items-stretch">
          {Array.from({ length: copies }, (_, s) => (
            <div key={s} ref={s === 0 ? setRef : null} className="flex gap-6 pr-6">
              {brands.map((brand) => (
                <BrandCard
                  key={`${s}-${brand._id}`}
                  brand={brand}
                  cityName={cityName[String(brand.cityId)]}
                  duplicate={s > 0}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
