import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, HandCoins, MapPin, Search, ShieldCheck } from 'lucide-react'
import VoiceSearchButton from '../ui/VoiceSearchButton'
import Aurora from '../ui/Aurora'
import { formatPrice } from '../../ui'

const TICKER = ['Bakery', 'Coffee', 'Groceries', 'Ceramics', 'Lighting', 'Linen', 'Cleaning', 'Plumbing', 'Electrical']

const TRUST = [
  { icon: MapPin, text: 'Inside 1.5 km' },
  { icon: HandCoins, text: 'Cash at the door' },
  { icon: ShieldCheck, text: 'Local sellers only' },
]

const EASE = [0.22, 1, 0.36, 1]

function TickerItems() {
  return (
    <div className="flex shrink-0 items-center">
      {TICKER.map((word) => (
        <span key={word} className="flex items-center whitespace-nowrap px-5 text-[12px] font-medium uppercase tracking-[0.16em] text-cream/75">
          {word}
          <span aria-hidden="true" className="ml-5 h-1 w-1 rounded-full bg-gold" />
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

function BasketCard({ items, reduced }) {
  return (
    <motion.div
      style={{ rotate: -1.5 }}
      animate={reduced ? undefined : { y: [0, -9, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      className="relative z-10 mx-4 -mt-24 w-auto rounded-panel border border-line-warm/80 bg-paper-warm/90 p-5 shadow-[0_28px_70px_-24px_rgba(21,20,15,0.45)] backdrop-blur-xl sm:absolute sm:bottom-6 sm:-left-10 sm:mx-0 sm:mt-0 sm:w-[290px] lg:-left-16"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">One block basket</p>
        <span aria-hidden="true" className="pulse-dot h-1.5 w-1.5 rounded-full bg-success text-success" />
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
        <span className="rounded-full bg-gradient-to-br from-noir to-forest-deep px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cream">
          Cash
        </span>
      </div>
      <p className="mt-2 text-[10.5px] text-muted">
        {items.length === 0 ? 'Several shops' : items.length === 1 ? '1 shop' : `${items.length} shops`} · one delivery
        · no card needed
      </p>
    </motion.div>
  )
}

// The rotating stamp on the photograph. Lettering follows a circle, so it can
// turn slowly without ever looking like a loading spinner.
function DoorStamp() {
  return (
    <div className="absolute -bottom-7 -right-5 z-20 hidden h-24 w-24 items-center justify-center rounded-full bg-noir text-cream shadow-[0_18px_40px_-18px_rgba(21,20,15,0.7)] sm:flex lg:-right-7">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full animate-[spin_22s_linear_infinite]"
      >
        <defs>
          <path id="stamp-circle" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" />
        </defs>
        <text fill="currentColor" fontSize="7.6" letterSpacing="2.2" className="uppercase">
          <textPath href="#stamp-circle">Pay at the door · One block · 1.5 km ·</textPath>
        </text>
      </svg>
      <HandCoins className="h-6 w-6 text-gold" aria-hidden="true" />
    </div>
  )
}

export default function Hero({ products }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const basket = useBasket(products)
  const reduced = useReducedMotion()
  const { scrollY } = useScroll()
  const photoY = useTransform(scrollY, [0, 700], [0, 56])

  function onSubmit(event) {
    event.preventDefault()
    const query = term.trim()
    navigate(query ? `/nearby?q=${encodeURIComponent(query)}` : '/nearby')
  }

  const rise = (delay = 0) => ({
    initial: reduced ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: EASE },
  })

  return (
    <section className="relative overflow-hidden border-b border-line-warm bg-canvas" aria-labelledby="hero-title">
      <Aurora tone="warm" intensity={0.5} />
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent"
      />

      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:pb-24 lg:pt-14">
        <div className="relative z-10 min-w-0">
          <motion.p
            {...rise(0)}
            className="inline-flex items-center gap-2.5 rounded-full border border-line-warm/80 bg-paper-warm/75 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-ink/65 shadow-[0_8px_24px_-18px_rgba(21,20,15,0.5)] backdrop-blur"
          >
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-success text-success" aria-hidden="true" />
            Your block, open now
            <span aria-hidden="true" className="h-3 w-px bg-line-warm" />
            <span className="text-clay">Cash on delivery</span>
          </motion.p>

          <motion.h1
            id="hero-title"
            initial={reduced ? false : 'hidden'}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
            }}
            className="mt-6 font-display text-[54px] font-semibold leading-[0.93] tracking-[-0.04em] text-ink sm:text-[78px] xl:text-[94px]"
          >
            <motion.span
              className="block"
              variants={{
                hidden: { opacity: 0, y: '0.45em', filter: 'blur(6px)' },
                show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.85, ease: EASE } },
              }}
            >
              One bag.
            </motion.span>
            <motion.span
              className="mt-1 block"
              variants={{
                hidden: { opacity: 0, y: '0.45em', filter: 'blur(6px)' },
                show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.85, ease: EASE } },
              }}
            >
              <em className="text-gradient font-normal italic">The whole block.</em>
            </motion.span>
          </motion.h1>

          <motion.p {...rise(0.3)} className="mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-ink/65 sm:text-[16.5px]">
            Bread from two streets over. A lamp from the studio around the corner. A plumber at your gate by six.
            Everything within <strong className="whitespace-nowrap font-semibold text-ink">1.5 km</strong> — paid in cash when it reaches
            your door.
          </motion.p>

          <motion.form
            {...rise(0.4)}
            onSubmit={onSubmit}
            role="search"
            className="group/search mt-8 flex items-center gap-2 rounded-full border border-line-warm bg-paper-warm/85 p-1.5 pl-2 shadow-[0_24px_55px_-28px_rgba(21,20,15,0.5)] backdrop-blur transition-[border-color,box-shadow] duration-300 focus-within:border-gold/70 focus-within:shadow-[0_24px_60px_-24px_rgba(182,71,42,0.35)]"
          >
            <Search className="ml-1.5 h-5 w-5 shrink-0 text-ink/40 transition-colors group-focus-within/search:text-clay" aria-hidden="true" />
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
            <VoiceSearchButton
              className="relative shrink-0"
              label="Search by voice"
              onResult={(text) => setTerm(text)}
            />
            <button
              type="submit"
              className="shine inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-clay to-clay-dark px-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_24px_-10px_rgba(182,71,42,0.8)] transition hover:brightness-110 active:scale-[0.98] sm:px-6"
            >
              Search
              <ArrowRight className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
            </button>
          </motion.form>

          <motion.div {...rise(0.5)} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <p>
              Try <span className="text-ink/70">“naan”</span>, <span className="text-ink/70">“lamp”</span> or{' '}
              <span className="text-ink/70">“electrician”</span>
            </p>
            <Link to="/services" className="link-underline inline-flex items-center gap-1 font-medium text-clay">
              Book a service
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </motion.div>

          <motion.ul {...rise(0.6)} className="mt-8 flex flex-wrap gap-2.5">
            {TRUST.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-2 rounded-full border border-line-warm/80 bg-paper-warm/60 px-3 py-1.5 text-[12.5px] font-medium text-ink/65 backdrop-blur transition hover:-translate-y-0.5 hover:border-clay/40 hover:text-ink"
              >
                <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                {text}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.96, y: 26 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          className="relative mx-auto w-full min-w-0 max-w-[560px] lg:max-w-none"
        >
          <div className="group relative aspect-[4/3] overflow-hidden rounded-panel bg-sand shadow-[0_40px_90px_-40px_rgba(21,20,15,0.55)] ring-1 ring-ink/5 sm:aspect-[5/4]">
            <motion.div style={reduced ? undefined : { y: photoY }} className="absolute -inset-y-12 inset-x-0">
              <picture>
                <source media="(max-width: 640px)" srcSet="/images/hero-block-800.jpg" />
                <img
                  src="/images/hero-block.jpg"
                  alt="A linen tote, a sourdough loaf, olive oil and ceramics on a sunlit counter"
                  width="1400"
                  height="933"
                  fetchPriority="high"
                  className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.04]"
                />
              </picture>
            </motion.div>
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-noir/45 via-transparent to-noir/10" />
            <span className="absolute right-4 top-4 rounded-full border border-white/40 bg-paper-warm/85 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-noir shadow-sm backdrop-blur-md">
              1.5 km radius
            </span>
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full glass-dark px-3 py-1.5 text-[11px] font-medium text-cream">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-glow-sage text-glow-sage" aria-hidden="true" />
              Shops on your street
            </span>
          </div>
          <DoorStamp />
          <BasketCard items={basket} reduced={reduced} />
        </motion.div>
      </div>

      <div className="relative mt-10 bg-noir text-cream sm:mt-0">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-noir to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-noir to-transparent" />
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
