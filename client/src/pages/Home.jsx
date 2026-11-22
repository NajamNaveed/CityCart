import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react'
import Hero from '../components/home/Hero'
import StoreCard from '../components/home/StoreCard'
import ProviderCard from '../components/home/ProviderCard'
import PromiseBand from '../components/home/PromiseBand'
import ShelfProductCard from '../components/store/ShelfProductCard'
import CartTray from '../components/store/CartTray'
import { AnimatedNumber, Aurora, Reveal } from '../components/ui'
import { SectionHead, shell as SHELL } from '../design'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { useHomeFeed } from '../hooks/useHomeFeed'
import { usePageMeta } from '../hooks/usePageMeta'
import { organizationLd, websiteLd } from '../utils/seo'
import { formatDistance } from '../utils/geo'

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line-warm bg-paper-warm p-2.5">
      <div className="aspect-[4/3] w-full animate-pulse rounded-tile bg-sand/70" />
      <div className="space-y-2.5 p-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-sand" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-sand/70" />
        <div className="h-8 w-full animate-pulse rounded-full bg-sand/50" />
      </div>
    </div>
  )
}

function EmptyNote({ children, to, linkLabel, className = '' }) {
  return (
    <div
      className={`rounded-card border border-dashed border-line-warm bg-paper-warm/70 px-6 py-10 text-center ${className}`}
    >
      <p className="text-[14px] text-ink/60">{children}</p>
      {to && (
        <Link
          to={to}
          className="link-underline mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-clay"
        >
          {linkLabel}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

function ServiceCta({ wide = false, className = '' }) {
  return (
    <div
      className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-card bg-noir p-6 text-cream shadow-[0_24px_50px_-30px_rgba(21,20,15,0.7)] ${
        wide ? 'lg:justify-center' : ''
      } ${className}`}
    >
      <Aurora tone="gold" intensity={0.35} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full border border-cream/10 transition-transform duration-700 group-hover:scale-110"
      />
      <div className={`relative ${wide ? 'lg:max-w-[430px]' : ''}`}>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-tile border border-cream/15 bg-cream/5 text-gold">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="font-display mt-5 text-[24px] font-semibold leading-tight tracking-tight">
          A pro for the job,
          <br />
          <em className="font-normal italic text-gold-soft">from your block.</em>
        </h3>
        <p className="mt-3 text-[13px] leading-relaxed text-cream/55">
          Cleaning, plumbing, electrical work and more. Every provider works one block at a time.
        </p>
      </div>
      <Link
        to="/services"
        className="shine relative mt-6 inline-flex h-10 w-fit items-center gap-2 rounded-full bg-cream px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-noir transition-colors hover:bg-white"
      >
        Browse services
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

// The promises, expressed as figures a shopper can check: the radius, the bag
// and the payment. Counts of today's live feed sit underneath.
function BlockPulse({ stores, products, providers, cityName }) {
  const figures = [
    { value: 1.5, decimals: 1, suffix: 'km', label: 'from your door' },
    { value: 1, suffix: 'bag', label: 'across several shops' },
    { value: 0, suffix: 'cards', label: 'needed at checkout' },
  ]

  return (
    <section className={`${SHELL} pb-14 sm:pb-20`} aria-label="How your block works">
      <Reveal>
        <div className="relative overflow-hidden rounded-panel bg-forest-deep px-6 py-10 text-cream shadow-[0_36px_80px_-50px_rgba(14,36,27,0.9)] sm:px-10 sm:py-12">
          <Aurora tone="forest" intensity={0.4} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent"
          />
          <div className="relative grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cream/45">The block, in numbers</p>
              <h2 className="font-display mt-3 text-[30px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[38px]">
                Small radius.
                <br />
                <em className="font-normal italic text-gold-soft">Big difference.</em>
              </h2>
              <p className="mt-4 max-w-md text-[13px] leading-relaxed text-cream/55">
                {cityName ? `Today in ${cityName}: ` : 'Today: '}
                {stores.length} {stores.length === 1 ? 'shop' : 'shops'}, {products.length}{' '}
                {products.length === 1 ? 'shelf pick' : 'shelf picks'} and {providers.length}{' '}
                {providers.length === 1 ? 'pro' : 'pros'} are within reach of your street.
              </p>
            </div>

            <dl className="grid grid-cols-3 gap-4 border-t border-cream/10 pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <dd className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] text-cream sm:text-[40px]">
                    <AnimatedNumber
                      value={figure.value}
                      format={(n) => (figure.decimals ? n.toFixed(1) : Math.round(n).toString())}
                    />
                    <span className="ml-1 align-baseline text-[12px] font-medium uppercase tracking-[0.12em] text-gold">
                      {figure.suffix}
                    </span>
                  </dd>
                  <dt className="mt-2 text-[11.5px] leading-snug text-cream/45">{figure.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export default function Home() {
  usePageMeta({ title: 'Local brands, one cart', jsonLd: [organizationLd(), websiteLd()] })
  const { city, cities } = useCity()
  const { selectedBlocks, blockIds, areaName } = useNearby()
  const { city: feedCity, stores, products, providers, loading, failed } = useHomeFeed(blockIds)

  const cityName = feedCity?.name || city?.name || cities[0]?.name || ''
  const where = (selectedBlocks.length > 0 && areaName) || cityName
  const blockSet = new Set(blockIds.map(String))
  const inBlock = (store) => (store.branches || []).some((branch) => blockSet.has(String(branch.blockId)))
  const visibleStores = stores.slice(0, 6)
  const visibleProviders = providers.slice(0, 3)

  return (
    <div className="bg-canvas">
      <Hero products={products} />

      {/* 01 — Stores */}
      <section className={`${SHELL} pb-14 pt-14 sm:pb-20 sm:pt-20`} aria-labelledby="stores-heading">
        <Reveal>
          <SectionHead
            id="stores-heading"
            index="01"
            eyebrow="Shop your block"
            title="Stores on your street."
            accent="Not across town."
            lede={
              where
                ? `Shops within walking distance of ${where}. Each one packs and delivers its own order — you pay each at the door.`
                : 'Local shops inside 1.5 km. Each one packs and delivers its own order — you pay each at the door.'
            }
            to="/nearby"
            linkLabel="All shops"
          />
        </Reveal>
        {failed ? (
          <EmptyNote to="/nearby" linkLabel="Open the shop directory">
            We couldn&apos;t load the block just now. You can still browse shops near you.
          </EmptyNote>
        ) : loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <CardSkeleton key={key} />
            ))}
          </div>
        ) : visibleStores.length === 0 ? (
          <EmptyNote to="/nearby" linkLabel="Browse every store">
            No shops are live {cityName ? `in ${cityName}` : 'here'} yet. The block is still opening up.
          </EmptyNote>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleStores.map((store, index) => (
              <Reveal key={store._id} delay={index * 0.06} className="h-full">
                <StoreCard store={store} inBlock={inBlock(store)} />
              </Reveal>
            ))}
          </div>
        )}

        {where && (
          <p className="mt-6 flex items-center gap-2 text-[12px] text-muted">
            <MapPin className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
            {selectedBlocks.length > 0
              ? `Shops in ${where} come first. Deliveries stay inside 1.5 km.`
              : `Showing shops across ${cityName}. Set your block on the shops page to narrow it down.`}
          </p>
        )}
      </section>

      {!loading && !failed && (
        <BlockPulse stores={stores} products={products} providers={providers} cityName={cityName} />
      )}

      {/* 02 — Products */}
      <section className="relative overflow-hidden border-y border-line-warm bg-cream" aria-labelledby="shelf-heading">
        <Aurora tone="gold" intensity={0.3} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-28 top-12 h-80 w-80 rounded-full border border-clay/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full border border-clay/[0.07]"
        />
        <div className={`relative ${SHELL} py-14 sm:py-20`}>
          <Reveal>
            <SectionHead
              id="shelf-heading"
              index="02"
              eyebrow="On the shelf"
              title="Picked from"
              accent="your block."
              lede="Small-batch things stocked within walking distance. Add from a few shops — one bag, several stops."
              to="/nearby"
              linkLabel="Browse the shelf"
            />
          </Reveal>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((key) => (
                <CardSkeleton key={key} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyNote to="/nearby" linkLabel="Search shops near you">
              {failed
                ? 'The shelf could not be loaded just now.'
                : 'The shelf is being stocked. Check the shops near you in the meantime.'}
            </EmptyNote>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-4">
              {products.map((product, index) => (
                <Reveal key={product._id} delay={index * 0.045} className="h-full">
                  <ShelfProductCard
                    product={product}
                    meta={`${product.brandName}${
                      product.distanceKm !== null && product.distanceKm !== undefined
                        ? ` · ${formatDistance(product.distanceKm)}`
                        : ''
                    }`}
                    className="h-full w-full"
                  />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 03 — Services */}
      <section className={`${SHELL} py-14 sm:py-20`} aria-labelledby="services-heading">
        <Reveal>
          <SectionHead
            id="services-heading"
            index="03"
            eyebrow="Around the corner"
            title="Pros who know"
            accent="your street."
            lede="Vetted providers who work one block at a time. See a starting price, then book a slot that suits you."
            to="/services"
            linkLabel="All services"
          />
        </Reveal>
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <CardSkeleton key={key} />
            ))}
          </div>
        ) : visibleProviders.length === 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <EmptyNote className="sm:col-span-2" to="/services" linkLabel="Meet the pros">
              No providers are live {cityName ? `in ${cityName}` : 'here'} yet. Services are opening block by
              block.
            </EmptyNote>
            <ServiceCta />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProviders.map((provider, index) => (
              <Reveal key={provider._id} delay={index * 0.06} className="h-full">
                <ProviderCard provider={provider} />
              </Reveal>
            ))}
            {visibleProviders.length < 3 && (
              <Reveal delay={visibleProviders.length * 0.06} className="h-full">
                <ServiceCta
                  wide={visibleProviders.length === 1}
                  className={visibleProviders.length === 1 ? 'lg:col-span-2' : ''}
                />
              </Reveal>
            )}
          </div>
        )}
      </section>

      <PromiseBand />

      <CartTray />
    </div>
  )
}
