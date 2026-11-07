import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, HandCoins, MapPin, Search, ShieldCheck } from 'lucide-react'
import { formatPrice } from '../../ui'

const TICKER = ['Bakery', 'Coffee', 'Groceries', 'Ceramics', 'Lighting', 'Linen', 'Cleaning', 'Plumbing', 'Electrical']

const TRUST = [
  { icon: MapPin, text: 'Inside 1.5 km' },
  { icon: HandCoins, text: 'Cash at the door' },
  { icon: ShieldCheck, text: 'Local sellers only' },
]

function TickerItems() {
  return (
    <div className="flex shrink-0 items-center">
      {TICKER.map((word) => (
        <span key={word} className="flex items-center whitespace-nowrap px-5 text-[12px] font-medium uppercase tracking-[0.16em] text-cream/75">
          {word}
          <span aria-hidden="true" className="ml-5 h-1 w-1 rounded-full bg-clay" />
        </span>
      ))}
    </div>
  )
}

// One product from each of up to three shops. Only live feed data is shown, so
// the card never invents a basket that could not be ordered.
function useBasket(products) {
  return useMemo(() => {
    const seen = new Set()
    const items = []
    for (const product of products) {
      if (!product.brandName || seen.has(product.brandName)) continue
      seen.add(product.brandName)
      items.push(product)
      if (items.length === 3) break
    }
    return items
  }, [products])
}

function BasketCard({ items }) {
  return (
    <div className="relative z-10 mx-4 -mt-24 w-auto rotate-[-1.5deg] rounded-card border border-line-warm bg-paper-warm p-5 shadow-[0_24px_60px_rgba(21,20,15,0.2)] sm:absolute sm:bottom-7 sm:left-0 sm:mx-0 sm:mt-0 sm:w-[292px] lg:left-[-42px]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">One block basket</p>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sage ring-4 ring-sage/40" />
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 space-y-2.5 border-y border-dashed border-line-warm py-4">
          {items.map((item) => (
            <li key={`${item.brandName}-${item._id}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-ink">{item.name}</span>
                <span className="block truncate text-[10.5px] text-muted">{item.brandName}</span>
              </span>
              <b className="shrink-0 text-[11.5px] font-semibold tabular-nums text-ink/80">{formatPrice(item.price)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-y border-dashed border-line-warm py-4 text-[12.5px] leading-relaxed text-ink/70">
          Bread, coffee, a lamp — and a plumber for six o&apos;clock. One visit, one payment.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted">Pay at the door</span>
        <span className="rounded-full bg-noir px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cream">
          Cash
        </span>
      </div>
      <p className="mt-2 text-[10.5px] text-muted">
        {items.length === 0 ? 'Several shops' : items.length === 1 ? '1 shop' : `${items.length} shops`} · one delivery
        · no card needed
      </p>
    </div>
  )
}

export default function Hero({ products }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const basket = useBasket(products)

  function onSubmit(event) {
    event.preventDefault()
    const query = term.trim()
    navigate(query ? `/nearby?q=${encodeURIComponent(query)}` : '/nearby')
  }

  return (
    <section className="relative overflow-hidden border-b border-line-warm bg-canvas" aria-labelledby="hero-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-[#fdf6ea] blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 pb-14 pt-7 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:pb-20 lg:pt-12">
        <div className="relative z-10 min-w-0">
          <h1
            id="hero-title"
            className="font-display text-[52px] font-semibold leading-[0.94] tracking-[-0.035em] text-ink sm:text-[76px] xl:text-[90px]"
          >
            One bag.
            <br />
            <em className="font-normal italic text-clay">The whole block.</em>
          </h1>

          <p className="mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-ink/65 sm:text-[16.5px]">
            Bread from two streets over. A lamp from the studio around the corner. A plumber at your gate by six.
            Everything within <strong className="whitespace-nowrap font-semibold text-ink">1.5 km</strong> — paid in cash when it reaches
            your door.
          </p>

          <form
            onSubmit={onSubmit}
            role="search"
            className="mt-8 flex items-center gap-2 rounded-card border border-line-warm bg-paper-warm p-2 shadow-[0_20px_45px_rgba(21,20,15,0.08)] transition focus-within:border-ink/35"
          >
            <Search className="ml-2 h-5 w-5 shrink-0 text-ink/40" aria-hidden="true" />
            <label htmlFor="landing-search" className="sr-only">
              Search your block
            </label>
            <input
              id="landing-search"
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search bread, a lamp, an electrician…"
              className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
            />
            <button
              type="submit"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-tile bg-noir px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-cream transition-colors hover:bg-noir-soft sm:px-6"
            >
              Search
              <ArrowRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <p>
              Try <span className="text-ink/70">“naan”</span>, <span className="text-ink/70">“lamp”</span> or{' '}
              <span className="text-ink/70">“electrician”</span>
            </p>
            <Link to="/services" className="inline-flex items-center gap-1 font-medium text-clay hover:underline">
              Book a service
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5">
            {TRUST.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-[12.5px] font-medium text-ink/60">
                <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full min-w-0 max-w-[560px] lg:max-w-none">
          <div className="relative aspect-[4/3] overflow-hidden rounded-panel bg-sand sm:aspect-[5/4]">
            <picture>
              <source media="(max-width: 640px)" srcSet="/images/hero-block-800.jpg" />
              <img
                src="/images/hero-block.jpg"
                alt="A linen tote, a sourdough loaf, olive oil and ceramics on a sunlit counter"
                width="1400"
                height="933"
                fetchPriority="high"
                className="h-full w-full object-cover"
              />
            </picture>
            <span className="absolute right-4 top-4 rounded-full bg-cream/90 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-noir backdrop-blur-sm">
              1.5 km radius
            </span>
          </div>
          <BasketCard items={basket} />
        </div>
      </div>

      <div className="relative mt-10 bg-noir text-cream sm:mt-0">
        <p className="sr-only">Your block: {TICKER.join(', ')}.</p>
        <div className="flex overflow-hidden py-3.5">
          <div className="v3-marquee flex w-max" aria-hidden="true">
            <TickerItems />
            <TickerItems />
          </div>
        </div>
      </div>
    </section>
  )
}
