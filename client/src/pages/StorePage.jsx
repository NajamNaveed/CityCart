import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Clock, Mail, MapPin, Phone, Store as StoreIcon } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductCard from '../components/ProductCard'
import ProductImage from '../components/ProductImage'
import { EmptyState, ErrorState, Skeleton, badge, btn, panel, shell } from '../design'
import { usePageMeta } from '../hooks/usePageMeta'
import { breadcrumbLd, storeLd } from '../utils/seo'

const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
]

function addressLine(address) {
  if (!address || typeof address !== 'object') return ''
  return [address.addressLine, address.city, address.state].filter(Boolean).join(', ')
}

function contactValue(contact, keys) {
  if (!contact || typeof contact !== 'object') return ''
  for (const key of keys) {
    if (contact[key]) return contact[key]
  }
  return ''
}

function StoreSkeleton() {
  return (
    <div className={`${shell} pb-16 pt-10`}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 aspect-[3/1] w-full rounded-panel" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="aspect-[4/5] w-full rounded-card" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-panel" />
      </div>
    </div>
  )
}

export default function StorePage() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, data: null, error: '' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    api
      .get(`/brands/${id}/storefront`)
      .then((res) => active && setState({ id, data: res.data, error: '' }))
      .catch((err) => {
        if (!active) return
        const gone = err.response?.status === 404 || err.response?.status === 400
        setState({ id, data: null, error: gone ? 'This store is not available.' : getErrorMessage(err) })
      })
    return () => {
      active = false
    }
  }, [id, reload])

  const loaded = state.id === id ? state.data : null
  const storeName = loaded?.store?.name || loaded?.brand?.name || 'Store'
  const storeDescription = loaded?.store?.description || loaded?.brand?.description
  const storeImage = loaded?.store?.banner || loaded?.brand?.coverImage

  usePageMeta({
    title: loaded ? storeName : 'Store',
    description: storeDescription,
    image: storeImage || undefined,
    noindex: state.id === id && !state.data,
    jsonLd: loaded
      ? [
          storeLd({
            name: storeName,
            description: storeDescription,
            image: storeImage,
            address: loaded.store?.address,
            phone: contactValue(loaded.store?.contact, ['phone', 'phoneNumber', 'mobile']),
            email: contactValue(loaded.store?.contact, ['email']),
            path: `/store/${id}`,
          }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Stores', path: '/nearby' },
            { name: storeName, path: `/store/${id}` },
          ]),
        ]
      : null,
  })

  if (state.id !== id) {
    return (
      <div className="bg-canvas">
        <StoreSkeleton />
      </div>
    )
  }

  if (!state.data) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} py-16`}>
          {state.error && state.error !== 'This store is not available.' ? (
            <ErrorState message={state.error} onRetry={() => setReload((n) => n + 1)} />
          ) : (
            <EmptyState
              icon={StoreIcon}
              title={state.error}
              message="It may have closed, or the link is wrong."
              action={
                <Link to="/nearby" className={btn('noir', 'md')}>
                  Browse stores near you
                </Link>
              }
            />
          )}
        </div>
      </div>
    )
  }

  const { brand, store, categories = [], featuredProducts = [] } = state.data
  const name = store?.name || brand?.name || 'Store'
  const banner = store?.banner || brand?.coverImage
  const description = store?.description || brand?.description
  const logo = store?.logo || brand?.logo
  const address = addressLine(store?.address)
  const phone = contactValue(store?.contact, ['phone', 'phoneNumber', 'mobile'])
  const email = contactValue(store?.contact, ['email'])
  const hours = store?.businessHours && typeof store.businessHours === 'object' ? store.businessHours : null
  const openDays = hours ? DAYS.filter(([key]) => hours[key] && hours[key].toLowerCase() !== 'closed') : []

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-6 sm:pt-8`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink/45">
          <Link to="/" className="transition hover:text-ink">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link to="/nearby" className="transition hover:text-ink">
            Stores
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="max-w-48 truncate text-ink/70">{name}</span>
        </nav>

        <section className="relative mt-5 overflow-hidden rounded-panel bg-sand">
          <div className="relative h-[210px] bg-noir-soft sm:h-[280px]">
            {banner && <ProductImage src={banner} name={name} className="h-full w-full" width={1600} />}
            <div
              aria-hidden="true"
              className={`absolute inset-0 ${
                banner
                  ? 'bg-gradient-to-t from-noir/80 via-noir/25 to-transparent'
                  : 'bg-[radial-gradient(120%_120%_at_18%_0%,rgba(28,58,46,0.95),#15140f_72%)]'
              }`}
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-4 p-5 sm:p-8">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-white/25 bg-cream/95 shadow-lg sm:h-20 sm:w-20">
                {logo ? (
                  <img src={logo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <StoreIcon className="h-7 w-7 text-clay/60" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cream/60">On your block</p>
                <h1 className="font-display mt-1.5 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-cream sm:text-[40px]">
                  {name}
                </h1>
                {address && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-cream/70">
                    <MapPin className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
                    {address}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10">
          <div className="min-w-0">
            {description && (
              <p className="max-w-2xl text-[14px] leading-relaxed text-ink/65">{description}</p>
            )}

            {categories.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {categories.flatMap((category) => [category, ...(category.children || [])]).slice(0, 10).map((category) => (
                  <span key={category._id} className={badge('soft')}>
                    {category.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-10 flex flex-wrap items-end justify-between gap-3 border-b border-line-warm pb-4">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink/45">On the shelf</p>
                <h2 className="font-display mt-2 text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
                  Fresh from this store
                </h2>
              </div>
              <Link to={`/nearby?q=${encodeURIComponent(brand.name)}`} className="text-[12px] font-medium text-clay underline-offset-4 hover:underline">
                See everything they sell
              </Link>
            </div>

            {featuredProducts.length === 0 ? (
              <EmptyState
                icon={StoreIcon}
                title="The shelves are being stocked"
                message="This store has not listed anything yet. Check back soon."
                className="mt-6"
              />
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featuredProducts.map((product) => (
                  <ProductCard key={product._id} product={product} brandName={brand.name} />
                ))}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className={`${panel} p-5`}>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink/45">Visit the shop</p>
              <h2 className="font-display mt-2 text-[20px] font-semibold tracking-tight text-ink">{store?.name || name}</h2>

              <ul className="mt-4 space-y-3 text-[12.5px] text-ink/65">
                {address && (
                  <li className="flex gap-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>{address}</span>
                  </li>
                )}
                {phone && (
                  <li className="flex gap-2.5">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
                    <a href={`tel:${phone}`} className="transition hover:text-ink">
                      {phone}
                    </a>
                  </li>
                )}
                {email && (
                  <li className="flex gap-2.5">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
                    <a href={`mailto:${email}`} className="break-all transition hover:text-ink">
                      {email}
                    </a>
                  </li>
                )}
                {openDays.length > 0 && (
                  <li className="flex gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>
                      {openDays.map(([, label]) => label.slice(0, 3)).join(' · ')}
                      <span className="block text-[11.5px] text-muted">Typically {hours[openDays[0][0]]}</span>
                    </span>
                  </li>
                )}
              </ul>

              <div className="mt-5 border-t border-line-warm pt-4">
                <p className="text-[11.5px] leading-relaxed text-ink/55">
                  Cash at the door. This store packs and delivers its own orders inside 1.5 km.
                </p>
                <Link to={`/nearby?q=${encodeURIComponent(brand.name)}`} className={`mt-4 w-full ${btn('noir', 'md')}`}>
                  Shop this store
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
