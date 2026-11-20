import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import ShelfProductCard from './ShelfProductCard'

/**
 * A category as one scrolling row, the way a real shop shows a shelf: name and
 * item count on the left, products running off to the right. Scrolling stays
 * native (trackpad, touch, keyboard) — the header arrows only exist so desktop
 * visitors know the row continues.
 */
export default function ProductShelf({ shelf, brandName }) {
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const node = rowRef.current
    if (!node) return
    const max = node.scrollWidth - node.clientWidth
    setEdges({ start: node.scrollLeft <= 4, end: node.scrollLeft >= max - 4 })
  }, [])

  useEffect(() => {
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  function scrollRow(direction) {
    const node = rowRef.current
    if (!node) return
    node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: 'smooth' })
  }

  const hidden = shelf.count - shelf.products.length
  const scrolled = !edges.start || !edges.end

  return (
    <section aria-label={shelf.name} className="mt-9 first:mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-warm pb-3">
        <h3 className="font-display text-[21px] font-semibold tracking-tight text-ink sm:text-[23px]">
          {shelf.name}
        </h3>
        <div className="flex items-center gap-3">
          <p className="text-[11.5px] text-muted">
            {shelf.count} {shelf.count === 1 ? 'item' : 'items'}
          </p>
          {scrolled && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={() => scrollRow(-1)}
                disabled={edges.start}
                aria-label={`Scroll ${shelf.name} backwards`}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-line-warm bg-paper-warm text-ink/60 transition hover:border-ink/40 hover:text-ink disabled:opacity-35 disabled:hover:border-line-warm"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollRow(1)}
                disabled={edges.end}
                aria-label={`Scroll ${shelf.name} forwards`}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-line-warm bg-paper-warm text-ink/60 transition hover:border-ink/40 hover:text-ink disabled:opacity-35 disabled:hover:border-line-warm"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-4">
        <div
          ref={rowRef}
          onScroll={measure}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {shelf.products.map((product) => (
            <ShelfProductCard key={product._id} product={product} />
          ))}

          {hidden > 0 && (
            <Link
              to={`/nearby?q=${encodeURIComponent(brandName)}`}
              className="flex w-[132px] shrink-0 snap-start flex-col justify-center gap-1.5 self-stretch rounded-card border border-dashed border-line-warm bg-canvas/60 px-3 text-center transition hover:border-ink/30 hover:bg-canvas"
            >
              <span className="font-display text-[20px] font-semibold leading-none tracking-tight text-ink">
                {hidden} more
              </span>
              <span className="text-[11px] leading-snug text-muted">in this category</span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-clay">See all</span>
            </Link>
          )}
        </div>

        {!edges.end && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-canvas to-transparent"
          />
        )}
      </div>
    </section>
  )
}
