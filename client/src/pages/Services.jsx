import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Layers, LayoutList, LocateFixed, Map as MapIcon, MapPin, Search, Star, Wrench } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCity } from '../hooks/useCity'
import { useCityDirectory } from '../hooks/useCityDirectory'
import { useMapFocus } from '../hooks/useMapFocus'
import { useNearby } from '../hooks/useNearby'
import { isRadius } from '../utils/range'
import { nextLayerState } from '../utils/layerState'
import MapLayers from '../components/nearby/MapLayers'
import RangeSelector from '../components/nearby/RangeSelector'
import ProductImage from '../components/ProductImage'
import { EmptyState, ErrorState, PageHeader, Skeleton, btn, card, cardLift, fieldClass, shell } from '../design'
import { formatDistance } from '../utils/geo'
import { formatPrice } from '../ui'

const ServicesMap = lazy(() => import('../components/services/ServicesMap'))

const SORTS = [
  ['rank', 'Recommended'],
  ['rating', 'Top rated'],
  ['price', 'Lowest starting price'],
]

const NEXT_RADIUS = [2, 5, 10, 20, 50]
const rangeLabel = (range) => (range === 'city' ? 'the whole city' : isRadius(range) ? `${range} km` : 'your block')

function nextRange(range) {
  if (range === 'block') return '5'
  if (isRadius(range)) {
    const bigger = NEXT_RADIUS.find((km) => km > Number(range))
    return bigger ? String(bigger) : 'city'
  }
  return null
}

function ProviderCard({ provider }) {
  return (
    <article className={`${card} ${cardLift} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <ProductImage
            src={provider.avatar || provider.coverImage}
            name={provider.displayName}
            className="size-16 shrink-0 rounded-tile text-sm"
          />
          <div className="min-w-0">
            <Link
              to={`/services/${provider.slug}`}
              className="block truncate font-display text-[20px] font-semibold leading-tight tracking-tight text-ink transition hover:text-clay"
            >
              {provider.displayName}
            </Link>
            <p className="mt-1 text-[12px] text-ink/55">
              {provider.category?.name}
              {provider.block?.name && <> · {provider.block.name}</>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink/55">
              {provider.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-clay text-clay" aria-hidden="true" />
                  <span className="font-medium text-ink">{provider.ratingAvg.toFixed(1)}</span>
                  <span>({provider.ratingCount})</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-clay">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  {provider.isNew ? 'New on CityCart' : 'No reviews yet'}
                </span>
              )}
              {provider.distanceKm !== null && provider.distanceKm !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-clay/70" aria-hidden="true" />
                  {formatDistance(provider.distanceKm)} away
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">Starting at</p>
          <p className="mt-1 font-display text-[19px] font-semibold text-ink">{formatPrice(provider.startingAtPrice / 100)}</p>
          <Link
            to={`/services/${provider.slug}`}
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-clay underline-offset-4 hover:underline"
          >
            View services
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {provider.bio && <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-ink/60">{provider.bio}</p>}

      {provider.topOfferings?.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-warm pt-3.5">
          {provider.topOfferings.map((offering) => (
            <Link
              key={offering._id}
              to={`/services/${provider.slug}`}
              className="rounded-full border border-line-warm bg-canvas px-3 py-1 text-[11.5px] text-ink/70 transition hover:border-clay/40 hover:text-clay"
            >
              {offering.title}
            </Link>
          ))}
          {provider.offeringCount > provider.topOfferings.length && (
            <span className="px-1 text-[11.5px] text-ink/45">
              +{provider.offeringCount - provider.topOfferings.length} more
            </span>
          )}
        </div>
      )}
    </article>
  )
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${card} p-5 sm:p-6`}>
          <div className="flex items-start gap-4">
            <Skeleton className="size-16 shrink-0 rounded-tile" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div
      role="group"
      aria-label="Results view"
      className="inline-flex overflow-hidden rounded-tile border border-line-warm bg-paper-warm text-[12px] font-medium"
    >
      {[
        ['list', 'List', LayoutList],
        ['map', 'Map', MapIcon],
      ].map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={`inline-flex h-9 items-center gap-1.5 px-3.5 transition ${
            view === value ? 'bg-noir text-cream' : 'text-ink/60 hover:text-ink'
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

export default function Services() {
  const navigate = useNavigate()
  const { city, cityId, cities } = useCity()
  const { selectedBlocks, blockIds, blocks, areaName, coords, pinned, origin, range, setRange, blocksReady, detect, setPin, status } = useNearby()
  const { focus, chooseCity } = useMapFocus(blocks)
  const [view, setView] = useState('list')
  const [blockLayer, setBlockLayer] = useState('all') // 'all' | 'mine' | 'off'
  const [providerLayer, setProviderLayer] = useState('all') // 'all' | 'mine' | 'off'
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState('rank')
  const [categories, setCategories] = useState([])
  const [reload, setReload] = useState(0)
  // "All providers" on the map means the whole city, even while the list keeps
  // searching inside the shopper's block.
  const cityProviders = useCityDirectory({
    cityId,
    kind: 'providers',
    enabled: view === 'map' && providerLayer === 'all',
    q,
    categoryId,
  })

  useEffect(() => {
    let active = true
    api
      .get('/services/categories')
      .then((res) => active && setCategories(res.data.categories || []))
      .catch(() => active && setCategories([]))
    return () => {
      active = false
    }
  }, [])

  // Same scope logic as the shopper's shop discovery: chosen block(s), a radius
  // around the shopper, or the whole city.
  const hasArea = blockIds.length > 0
  const hasLocation = hasArea || Boolean(coords)
  const needsArea = range === 'block' && !hasArea
  const radiusApplied = isRadius(range) && Boolean(origin)
  const openMapPicker = () => {
    setView('map')
    setPicking(true)
  }
  // A tap moves the shopper's spot only while they are choosing it.
  const handleMapPick = (lat, lng) => {
    if (!picking && hasLocation) return
    setPicking(false)
    setPin(lat, lng)
  }

  const filterKey = JSON.stringify([cityId, blockIds, coords, range, q, categoryId, sort])
  const [pageState, setPageState] = useState({ filterKey, page: 1 })
  const currentPage = pageState.filterKey === filterKey ? pageState.page : 1
  const setPageForFilters = (next) => setPageState({ filterKey, page: next })

  const query = useMemo(() => {
    if (!cityId || !blocksReady) return null
    const base = {
      page: currentPage,
      sort,
      ...(q && { q }),
      ...(categoryId && { categoryId }),
    }
    if (hasArea && range !== 'city') {
      return {
        ...base,
        scope: 'area',
        blockIds: blockIds.join(','),
        ...(origin && { lat: origin.lat, lng: origin.lng }),
        ...(isRadius(range) && origin && { radiusKm: range }),
      }
    }
    if (isRadius(range) && coords) {
      return { ...base, scope: 'radius', radiusKm: range, lat: coords.lat, lng: coords.lng }
    }
    return { ...base, cityId, scope: 'city', ...(coords && { lat: coords.lat, lng: coords.lng }) }
  }, [cityId, blocksReady, currentPage, sort, q, categoryId, hasArea, range, blockIds, origin, coords])

  const key = JSON.stringify(query)
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  useEffect(() => {
    if (!query) return undefined
    let active = true
    api
      .get('/services/discover', { params: query })
      .then((res) => active && setResult({ key, data: res.data, error: '' }))
      .catch((err) => active && setResult({ key, data: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [key, query, reload])

  const loading = Boolean(query) && result.key !== key
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : ''
  const items = data?.items || []
  const bigger = nextRange(range)
  const blockSet = new Set(blockIds.map(String))
  const inMyBlock = (provider) => blockSet.has(String(provider.block?._id))
  const zones = blockLayer === 'all' ? blocks : blockLayer === 'mine' ? selectedBlocks : []
  const mapProviders =
    providerLayer === 'all' ? (cityProviders ?? items) : providerLayer === 'mine' ? items.filter(inMyBlock) : []

  function onSearch(e) {
    e.preventDefault()
    setQ(draft.trim())
  }

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Local services"
          title="Services near"
          accent="you."
          lede="Cleaning, repairs, beauty and more — book a provider in your block. Agree the details and the final price directly with them."
        />

        <form onSubmit={onSearch} role="search" className="mt-8 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
            <label htmlFor="services-search" className="sr-only">
              Search a service or provider
            </label>
            <input
              id="services-search"
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search a service or provider…"
              className={fieldClass({ className: 'h-12 pl-10' })}
            />
          </div>
          <button type="submit" className={btn('noir', 'md')}>
            Search
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <button type="button" onClick={detect} disabled={status === 'detecting'} className={btn('outline', 'sm')}>
            <LocateFixed className={`h-3.5 w-3.5 ${status === 'detecting' ? 'animate-spin' : ''}`} aria-hidden="true" />
            {status === 'detecting' ? 'Finding you…' : hasLocation ? 'Update my location' : 'Use my location'}
          </button>
          <p className="text-[12px] text-ink/55">
            <MapPin className="mr-1 inline h-3.5 w-3.5 text-clay" aria-hidden="true" />
            {areaName ? `Looking in ${areaName}` : city ? city.name : 'Location not set'}
          </p>
          <div className="w-full sm:w-auto">
            <RangeSelector />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-52">
            <label htmlFor="service-category" className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink/45">
              Category
            </label>
            <select
              id="service-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass({ shape: 'select', className: 'h-10' })}
            >
              <option value="">All services</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-56">
            <label htmlFor="service-sort" className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink/45">
              Sort
            </label>
            <select
              id="service-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className={fieldClass({ shape: 'select', className: 'h-10' })}
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {needsArea && cityId && (
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-clay/20 bg-clay/5 px-3.5 py-2.5 text-[12.5px] text-clay">
            <span>Choose your area to search only your block. Showing the whole city for now.</span>
            <button type="button" onClick={openMapPicker} className="font-semibold underline">
              Choose on the map
            </button>
          </p>
        )}

        {(cityId || view === 'map') && (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-muted">
              {loading
                ? 'Finding providers…'
                : data
                  ? `${data.pagination.total} ${data.pagination.total === 1 ? 'provider' : 'providers'} · ${data.meta.totalOfferings} ${data.meta.totalOfferings === 1 ? 'service' : 'services'}`
                  : 'Providers near you'}
            </p>
            <ViewToggle view={view} onChange={setView} />
          </div>
        )}

        <section className="mt-4" aria-live="polite">
          {view === 'map' ? (
            <div className="relative isolate z-0 overflow-hidden rounded-panel border border-line-warm">
              <Suspense fallback={<Skeleton className="h-[460px] w-full rounded-none" />}>
                <ServicesMap
                  items={mapProviders}
                  zones={zones}
                  origin={origin}
                  radiusKm={isRadius(range) && origin ? Number(range) : null}
                  originLabel={
                    coords
                      ? pinned
                        ? 'Your chosen spot'
                        : 'Your spot'
                      : selectedBlocks.length === 1
                        ? `Centre of ${areaName}`
                        : 'Search centre'
                  }
                  pin={coords && pinned ? coords : null}
                  pickable={picking || !hasLocation}
                  onPick={handleMapPick}
                  onOpenProvider={(provider) => navigate(`/services/${provider.slug}`)}
                  focus={focus}
                />
              </Suspense>
              <MapLayers
                cities={cities}
                cityId={cityId}
                onCityChange={chooseCity}
                layers={[
                  {
                    key: 'blocks',
                    label: 'Blocks',
                    mineLabel: 'my block',
                    icon: Layers,
                    state: blockLayer,
                    onCycle: () => setBlockLayer(nextLayerState),
                  },
                  {
                    key: 'providers',
                    label: 'Providers',
                    mineLabel: 'my block',
                    icon: Wrench,
                    state: providerLayer,
                    onCycle: () => setProviderLayer(nextLayerState),
                  },
                ]}
              >
                <button
                  type="button"
                  aria-pressed={picking}
                  onClick={() => setPicking((v) => !v)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-tile border border-line-warm bg-paper-warm/95 px-3 text-[11.5px] font-medium text-ink shadow-sm backdrop-blur transition hover:border-ink/40"
                >
                  <MapPin className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
                  {picking ? 'Cancel' : 'Choose location'}
                </button>
              </MapLayers>
              {(picking || !hasLocation) && (
                <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 w-max max-w-[90%] -translate-x-1/2 rounded-full bg-noir/90 px-3.5 py-1.5 text-center text-[12px] text-cream shadow">
                  {picking ? 'Tap the map to set your location.' : 'Tap the map to choose where you are.'}
                </p>
              )}
              {data?.pagination?.pages > 1 && (
                <p className="px-3 pb-2 pt-1 text-[11.5px] text-muted">The map shows the providers on this page of results.</p>
              )}
            </div>
          ) : !cityId ? (
            <EmptyState
              icon={MapPin}
              title="Where should we look?"
              message="Share your location so we can show the service providers in your area."
              action={
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button type="button" onClick={detect} disabled={status === 'detecting'} className={btn('noir', 'md')}>
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                    Use my location
                  </button>
                  <button type="button" onClick={openMapPicker} className={btn('outline', 'md')}>
                    <MapIcon className="h-4 w-4" aria-hidden="true" />
                    Open the map
                  </button>
                </div>
              }
            />
          ) : loading || !query ? (
            <ResultsSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title={q ? `No services for “${q}” within ${rangeLabel(range)}` : `No service providers within ${rangeLabel(range)} yet`}
              message={
                range === 'city'
                  ? `Nothing matched in ${city?.name || 'this city'}. Try a different search or category.`
                  : 'Try a wider range to see more providers.'
              }
              action={
                bigger && (
                  <button type="button" onClick={() => setRange(bigger)} className={btn('noir', 'md')}>
                    {bigger === 'city' ? 'Search the whole city' : `Try ${bigger} km`}
                  </button>
                )
              }
            />
          ) : (
            <>
              <p className="mb-4 text-[12px] text-muted">
                {q && <>Results for “{q}” · </>}
                {isRadius(range) && radiusApplied && <>Within {rangeLabel(range)} · </>}
                {areaName && range !== 'block' && <>Around {areaName}</>}
              </p>
              <div className="space-y-4">
                {items.map((provider) => (
                  <ProviderCard key={provider._id} provider={provider} />
                ))}
              </div>
              {data.pagination.pages > 1 && (
                <div className="mt-8 flex items-center justify-between gap-3 text-[12.5px]">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPageForFilters(currentPage - 1)}
                    className={btn('outline', 'sm')}
                  >
                    Previous
                  </button>
                  <span className="text-muted">
                    Page {data.pagination.page} of {data.pagination.pages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= data.pagination.pages}
                    onClick={() => setPageForFilters(currentPage + 1)}
                    className={btn('outline', 'sm')}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
