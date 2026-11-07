import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react'
import Hero from '../components/home/Hero'
import StoreCard from '../components/home/StoreCard'
import ProviderCard from '../components/home/ProviderCard'
import PromiseBand from '../components/home/PromiseBand'
import ProductCard from '../components/ProductCard'
import { SectionHead, shell as SHELL } from '../design'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { useHomeFeed } from '../hooks/useHomeFeed'
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
          className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-clay hover:underline"
        >
          {linkLabel}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

function ServiceCta() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-card bg-noir p-6 text-cream">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-clay/25 blur-3xl"
      />
      <div className="relative">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-tile border border-cream/15 bg-cream/5 text-clay">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="font-display mt-5 text-[24px] font-semibold leading-tight tracking-tight">
          A pro for the job,
          <br />
          <em className="font-normal italic text-clay">from your block.</em>
        </h3>
        <p className="mt-3 text-[13px] leading-relaxed text-cream/55">
          Cleaning, plumbing, electrical work and more. Every provider works one block at a time.
        </p>
      </div>
      <Link
        to="/services"
        className="relative mt-6 inline-flex h-10 w-fit items-center gap-2 rounded-full bg-cream px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-noir transition-colors hover:bg-white"
      >
        Browse services
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

export default function Home() {
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
          <EmptyNote to="/brands" linkLabel="Browse every brand">
            No shops are live {cityName ? `in ${cityName}` : 'here'} yet. The block is still opening up.
          </EmptyNote>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleStores.map((store) => (
              <StoreCard key={store._id} store={store} inBlock={inBlock(store)} />
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

      {/* 02 — Products */}
      <section className="border-y border-line-warm bg-cream" aria-labelledby="shelf-heading">
        <div className={`${SHELL} py-14 sm:py-20`}>
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
            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  storeLabel={`${product.brandName}${
                    product.distanceKm !== null && product.distanceKm !== undefined
                      ? ` · ${formatDistance(product.distanceKm)}`
                      : ''
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 03 — Services */}
      <section className={`${SHELL} py-14 sm:py-20`} aria-labelledby="services-heading">
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
            {visibleProviders.map((provider) => (
              <ProviderCard key={provider._id} provider={provider} />
            ))}
            {visibleProviders.length < 3 && <ServiceCta />}
          </div>
        )}
      </section>

      <PromiseBand />
    </div>
  )
}
