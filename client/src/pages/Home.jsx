import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { HandCoins, MapPin, ShoppingBasket } from 'lucide-react'
import api from '../services/api'
import { useCity } from '../hooks/useCity'
import { useBrands } from '../hooks/useBrands'
import ProductCard from '../components/ProductCard'
import BrandMarquee from '../components/home/BrandMarquee'
import { useRatings } from '../hooks/useRatings'
import ProductImage from '../components/ProductImage'
import SectionHeader from '../components/SectionHeader'
import { Reveal } from '../components/ui'
import { btnOutline, btnPrimary, formatPrice, sectionLabel, wrap } from '../ui'

const HEADLINES = ['Paid on delivery.', 'From brands near you.', 'In one single cart.']

const TRUST = [
  { icon: HandCoins, text: 'Pay on delivery' },
  { icon: ShoppingBasket, text: 'One cart, many brands' },
  { icon: MapPin, text: 'Local brands by city' },
]

// The headline's last line cycles through the value propositions.
function RotatingHeadline({ words }) {
  const [index, setIndex] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return undefined
    const timer = setInterval(() => setIndex((v) => (v + 1) % words.length), 3200)
    return () => clearInterval(timer)
  }, [reduced, words.length])

  return (
    // The wrapper clips during the slide, so descenders (y, g, p…) get their
    // line box back via a touch of bottom padding, balanced by a negative margin.
    <span className="relative -mb-[0.16em] inline-block overflow-hidden pb-[0.16em] align-bottom">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          initial={reduced ? false : { y: '70%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-70%', opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export default function Home() {
  const { city, cityId } = useCity()
  const { brands, loading: brandsLoading } = useBrands(cityId)
  const [result, setResult] = useState({ key: null, items: [] })
  const key = cityId || 'all'

  useEffect(() => {
    let active = true
    api
      .get('/products', { params: { limit: 8, sort: 'createdAt', order: 'desc', ...(cityId && { cityId }) } })
      .then((res) => active && setResult({ key, items: res.data.products }))
      .catch(() => active && setResult({ key, items: [] }))
    return () => {
      active = false
    }
  }, [cityId, key])

  const loading = result.key !== key
  const products = result.items
  const brandName = Object.fromEntries(brands.map((b) => [b._id, b.name]))
  const ratings = useRatings(products.map((p) => p._id))
  const featured = products.slice(0, 2)

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 h-[480px] w-[480px] rounded-full bg-cream blur-3xl"
        />
        <div className={`${wrap} relative grid items-center gap-14 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24`}>
          <Reveal>
            <p className={sectionLabel}>{city ? `Shopping in ${city.name}` : 'The CityCart marketplace'}</p>
            <h1 className="font-display mt-5 text-[44px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Local brands.
              <br />
              One cart.
              <br />
              <span className="text-clay">
                <RotatingHeadline words={HEADLINES} />
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-[16.5px] leading-relaxed text-muted">
              Browse independent brands in your city, fill a single cart from several of them, and pay in cash when
              your order arrives.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/shop" className={btnPrimary}>
                Shop all products
              </Link>
              <Link to="/brands" className={btnOutline}>
                Browse brands
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-2.5">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </Reveal>

          {featured.length === 2 && (
            <Reveal delay={0.15} className="grid grid-cols-2 gap-5">
              {featured.map((p, i) => (
                <Link key={p._id} to={`/product/${p._id}`} className={`group block ${i === 1 ? 'lg:mt-14' : ''}`}>
                  <div className="overflow-hidden rounded-lg bg-sand shadow-sm shadow-ink/5">
                    <ProductImage
                      src={p.images?.[0]}
                      name={p.name}
                      className="aspect-[3/4] w-full transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <p className="mt-3 line-clamp-1 text-sm font-medium text-ink">{p.name}</p>
                  <p className="text-sm text-muted">{formatPrice(p.price)}</p>
                </Link>
              ))}
            </Reveal>
          )}
        </div>
      </section>

      {/* Brands — endless marquee, centre card rises */}
      <section id="brands" className="scroll-mt-24 pt-16">
        <div className={wrap}>
          <Reveal>
          <SectionHeader
            eyebrow="Marketplace"
            title={city ? `Brands in ${city.name}` : 'Brands on CityCart'}
            to="/brands"
            linkLabel="All brands"
          />
          </Reveal>
        </div>
        {brandsLoading ? (
          <div className="flex gap-6 overflow-hidden px-5 py-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[23.5rem] w-80 shrink-0 animate-pulse rounded-2xl border border-line/70 bg-white p-3"
              >
                <div className="h-44 w-full rounded-xl bg-sand/60" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-2/3 rounded bg-sand/80" />
                  <div className="h-3.5 w-full rounded bg-sand/50" />
                  <div className="h-3.5 w-4/5 rounded bg-sand/40" />
                </div>
              </div>
            ))}
          </div>
        ) : brands.length === 0 ? (
          <p className={`${wrap} text-[15px] text-muted`}>No brands are selling here yet.</p>
        ) : (
          <BrandMarquee brands={brands} />
        )}
      </section>

      {/* New arrivals */}
      <section className={`${wrap} pt-16`}>
        <Reveal>
          <SectionHeader eyebrow="Just landed" title="New arrivals" to="/shop" linkLabel="View all products" />
        </Reveal>
        {loading ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-lg bg-sand" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-[15px] text-muted">No products have been listed yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <Reveal key={p._id} delay={Math.min(i, 7) * 0.05} className="h-full">
                <ProductCard product={p} brandName={brandName[p.brandId]} rating={ratings[p._id]} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* Closing band before the footer */}
      <section className={`${wrap} pb-4 pt-20`}>
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-ink px-6 py-16 text-center text-white sm:px-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-clay/25 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-cream/10 blur-3xl"
            />
            <div className="relative">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">Why CityCart</p>
              <h2 className="font-display mx-auto mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">
                Everything local, gathered in one basket.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/65">
                Order from the brands on your street the way you would from anywhere online — one cart, one
                checkout, cash in hand at the door.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/shop" className={btnPrimary}>
                  Start shopping
                </Link>
                <Link
                  to="/brands"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/25 px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-white transition-colors hover:border-white/60"
                >
                  Meet the brands
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
