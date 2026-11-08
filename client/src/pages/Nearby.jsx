import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layers, LayoutGrid, LocateFixed, Map as MapIcon, MapPin, Search, Store as StoreIcon } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useCity } from '../hooks/useCity'
import { useMapFocus } from '../hooks/useMapFocus'
import { useNearby } from '../hooks/useNearby'
import { isRadius } from '../utils/range'
import { nextLayerState } from '../utils/layerState'
import MapLayers from '../components/nearby/MapLayers'
import RangeSelector from '../components/nearby/RangeSelector'
import StoreCard from '../components/home/StoreCard'
import { EmptyState, ErrorState, PageHeader, Skeleton, btn, fieldClass, shell } from '../design'

// Leaflet is only downloaded when the shopper opens the map view.
const NearbyMap = lazy(() => import('../components/nearby/NearbyMap'))

const NEXT_RADIUS = [2, 5, 10, 20, 50]

function nextRange(range) {
  if (range === 'block') return '5'
  if (isRadius(range)) {
    const bigger = NEXT_RADIUS.find((km) => km > Number(range))
    return bigger ? String(bigger) : 'city'
  }
  return null
}

const rangeLabel = (range) => (range === 'city' ? 'the whole city' : isRadius(range) ? `${range} km` : 'your block')

const STATUS_NOTES = {
  denied: 'Location is blocked for this site. Allow it in your browser settings, or choose your spot on the map.',
  outside: "We don't serve this spot yet. Pick a spot inside a shaded area on the map.",
  nodevice: "This device can't share its location. Choose your spot on the map.",
  error: "We couldn't find your location. Try again, or choose your spot on the map.",
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div key={key} className="overflow-hidden rounded-card border border-line-warm bg-paper-warm">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2.5 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </div>
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
        ['list', 'Stores', LayoutGrid],
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

export default function Nearby() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [view, setView] = useState('list') // 'list' | 'map'
  const [blockLayer, setBlockLayer] = useState('all') // 'all' | 'mine' | 'off'
  const [storeLayer, setStoreLayer] = useState('all') // 'all' | 'mine' | 'off'
  const [picking, setPicking] = useState(false)
  const openBrand = useCallback((brand) => navigate(`/store/${brand._id}`), [navigate])
  const q = params.get('q') || ''
  const { city, cityId, cities } = useCity()
  const { selectedBlocks, blockIds, blocks, areaName, coords, pinned, origin, range, setRange, blocksReady, detect, setPin, status } = useNearby()
  const { focus, chooseCity } = useMapFocus(blocks)

  const [draft, setDraft] = useState(q)
  // A search sent from the navbar arrives as a new query string; show it in the box.
  const [seenQuery, setSeenQuery] = useState(q)
  if (q !== seenQuery) {
    setSeenQuery(q)
    setDraft(q)
  }
  // The page number belongs to one set of filters; changing any of them starts again at page 1.
  const filterKey = JSON.stringify([cityId, blockIds, coords, range, q])
  const [pageState, setPageState] = useState({ filterKey, page: 1 })
  const page = pageState.filterKey === filterKey ? pageState.page : 1
  const setPage = (next) => setPageState({ filterKey, page: next })
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  const [reload, setReload] = useState(0)

  // Distance and block searches need somewhere to measure from; without it we
  // search the whole city and say so. A radius also needs one origin point:
  // the shopper's position, or the centre when exactly one block is chosen.
  const hasArea = blockIds.length > 0
  const needsArea = (range === 'block' && !hasArea) || (isRadius(range) && !hasArea && !coords)
  const radiusApplied = isRadius(range) && Boolean(origin)
  const needsOrigin = isRadius(range) && hasArea && !origin
  // Distances without a position are measured from the centre of the chosen block.
  const fromBlockCentre = Boolean(!coords && selectedBlocks.length === 1)
  const hasLocation = blockIds.length > 0 || Boolean(coords)
  const openMapPicker = () => {
    setView('map')
    setPicking(true)
  }
  // Tapping the map sets the shopper's spot when none is set, or while they are
  // deliberately changing it. Otherwise a tap leaves the saved spot alone.
  const handleMapPick = (lat, lng) => {
    if (!picking && hasLocation) return
    setPicking(false)
    setPin(lat, lng)
  }

  const query = useMemo(() => {
    if (!cityId || !blocksReady) return null
    const base = { page, ...(q && { q }) }
    // One or several chosen blocks (several where zones overlap), optionally within a range of the shopper.
    if (hasArea && range !== 'city') {
      return {
        ...base,
        scope: 'area',
        blockIds: blockIds.join(','),
        ...(origin && { lat: origin.lat, lng: origin.lng }),
        ...(isRadius(range) && origin && { radiusKm: range }),
      }
    }
    // Between blocks: a range around the shopper's position.
    if (isRadius(range) && coords) {
      return { ...base, cityId, scope: 'radius', radiusKm: range, lat: coords.lat, lng: coords.lng }
    }
    return { ...base, cityId, scope: 'city', ...(coords && { lat: coords.lat, lng: coords.lng }) }
  }, [cityId, blocksReady, q, coords, origin, blockIds, hasArea, range, page])

  const key = JSON.stringify(query)
  useEffect(() => {
    if (!query) return undefined
    let active = true
    api
      .get('/discover', { params: query })
      .then((res) => active && setResult({ key, data: res.data, error: '' }))
      .catch((err) => active && setResult({ key, data: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [key, query, reload])

  const loading = Boolean(query) && result.key !== key
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : ''

  function onSearch(e) {
    e.preventDefault()
    const next = draft.trim()
    setParams(next ? { q: next } : {})
  }

  const bigger = nextRange(range)
  const items = data?.items || []
  const blockSet = new Set(blockIds.map(String))
  const inBlock = (store) => (store.branches || []).some((branch) => blockSet.has(String(branch.blockId)))
  const zones = blockLayer === 'all' ? blocks : blockLayer === 'mine' ? selectedBlocks : []
  const mapStores = storeLayer === 'all' ? items : storeLayer === 'mine' ? items.filter(inBlock) : []

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Shop your block"
          title="Stores near"
          accent="you."
          lede="Every shop within reach of your door. Each one packs and delivers its own order — you pay each at the door."
        />

        <form onSubmit={onSearch} role="search" className="mt-8 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
            <label htmlFor="nearby-search" className="sr-only">
              Search stores or products
            </label>
            <input
              id="nearby-search"
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search a store, a product or a service…"
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
            {areaName ? `Shopping in ${areaName}` : city ? city.name : 'Location not set'}
            {coords && pinned ? ' · chosen on the map' : ''}
          </p>
          <div className="w-full sm:w-auto">
            <RangeSelector />
          </div>
        </div>

        {STATUS_NOTES[status] && (
          <p className="mt-3 rounded-tile border border-clay/20 bg-clay/5 px-3.5 py-2.5 text-[12.5px] text-clay">
            {STATUS_NOTES[status]}
          </p>
        )}

        {needsArea && cityId && (
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-clay/20 bg-clay/5 px-3.5 py-2.5 text-[12.5px] text-clay">
            <span>Choose your area to search {range === 'block' ? 'your block' : `within ${range} km`}. Showing the whole city for now.</span>
            <button type="button" onClick={openMapPicker} className="font-semibold underline">
              Choose on the map
            </button>
          </p>
        )}

        {needsOrigin && (
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-clay/20 bg-clay/5 px-3.5 py-2.5 text-[12.5px] text-clay">
            <span>With several blocks there is no single point to measure {range} km from, so showing all their shops. Set your exact spot to apply the range.</span>
            <button type="button" onClick={openMapPicker} className="font-semibold underline">
              Set my spot
            </button>
          </p>
        )}

        {(cityId || view === 'map') && (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-muted">
              {loading
                ? 'Finding stores…'
                : data
                  ? `${data.pagination.total} ${data.pagination.total === 1 ? 'store' : 'stores'} · ${data.meta.totalBranches} ${data.meta.totalBranches === 1 ? 'branch' : 'branches'}`
                  : 'Stores near you'}
            </p>
            <ViewToggle view={view} onChange={setView} />
          </div>
        )}

        <section className="mt-4" aria-live="polite">
          {view === 'map' ? (
            <div className="relative overflow-hidden rounded-panel border border-line-warm">
              <Suspense fallback={<Skeleton className="h-[460px] w-full rounded-none" />}>
                <NearbyMap
                  items={mapStores}
                  zones={zones}
                  origin={origin}
                  radiusKm={isRadius(range) && origin ? Number(range) : null}
                  originLabel={coords ? (pinned ? 'Your chosen spot' : 'You are here') : selectedBlocks.length === 1 ? `Centre of ${areaName}` : 'Search centre'}
                  pin={coords && pinned ? coords : null}
                  pickable={picking || !hasLocation}
                  onPick={handleMapPick}
                  onOpenBrand={openBrand}
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
                    key: 'stores',
                    label: 'Stores',
                    mineLabel: 'my stores',
                    icon: StoreIcon,
                    state: storeLayer,
                    onCycle: () => setStoreLayer(nextLayerState),
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
                <p className="pointer-events-none absolute bottom-3 left-1/2 z-[1000] w-max max-w-[90%] -translate-x-1/2 rounded-full bg-noir/90 px-3.5 py-1.5 text-center text-[12px] text-cream shadow">
                  {picking ? 'Tap the map to set your location.' : 'Tap the map to choose where you shop.'}
                </p>
              )}
              {data?.pagination?.pages > 1 && <p className="px-3 pb-2 pt-1 text-[11.5px] text-muted">The map shows the stores on this page of results.</p>}
            </div>
          ) : !cityId ? (
            <EmptyState
              icon={MapPin}
              title="Where are you shopping?"
              message="Share your location or choose your spot on the map, and we'll show the stores near you."
              action={
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button type="button" onClick={detect} disabled={status === 'detecting'} className={btn('noir', 'md')}>
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                    Use my location
                  </button>
                  <button type="button" onClick={() => setView('map')} className={btn('outline', 'md')}>
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
              icon={StoreIcon}
              title={q ? `Nothing for “${q}” within ${rangeLabel(range)}` : `No stores within ${rangeLabel(range)} yet`}
              message={
                range === 'city'
                  ? `We couldn't find any${q ? ' match' : ' stores'} in ${city?.name || 'this city'}. Try a different search.`
                  : 'Try a wider range to see more stores.'
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
                {range === 'block' && !needsArea && <>Within {rangeLabel(range)} · </>}
                {isRadius(range) && radiusApplied && <>Within {rangeLabel(range)} · </>}
                {areaName && range !== 'block' && <>Around {areaName} · </>}
                {fromBlockCentre && range !== 'block' && <>Measured from the centre of {areaName}</>}
              </p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((store) => {
                  const cover = store.products?.find((product) => product.image)?.image
                  return (
                    <StoreCard
                      key={store._id}
                      store={cover ? { ...store, cover } : store}
                      inBlock={inBlock(store)}
                    />
                  )
                })}
              </div>
              {data.pagination.pages > 1 && (
                <div className="mt-8 flex items-center justify-between gap-3 text-[12.5px]">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={btn('outline', 'sm')}>
                    Previous
                  </button>
                  <span className="text-muted">
                    Page {data.pagination.page} of {data.pagination.pages}
                  </span>
                  <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)} className={btn('outline', 'sm')}>
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
