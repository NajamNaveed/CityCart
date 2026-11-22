import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Clock, Mail, MapPin, Phone, Store as StoreIcon } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import ProductImage from '../components/ProductImage'
import CartTray from '../components/store/CartTray'
import ProductShelf from '../components/store/ProductShelf'
import { useCart } from '../hooks/useCart'
import { EmptyState, ErrorState, Skeleton, btn, shell } from '../design'
import { Reveal } from '../components/ui'
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
        <div className="min-w-0 space-y-9">
          {[0, 1].map((row) => (
            <div key={row}>
              <Skeleton className="h-5 w-44" />
              <div className="mt-4 flex gap-3 overflow-hidden">
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <Skeleton key={key} className="h-[248px] w-[164px] shrink-0 rounded-card sm:w-[178px]" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-panel" />
      </div>
    </div>
  )
}

export default function StorePage() {
  const { id } = useParams()
  const { itemCount } = useCart()
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

  const { brand, store, featuredProducts = [], shelves = [] } = state.data
  const name = store?.name || brand?.name || 'Store'
  const banner = store?.banner || brand?.coverImage
  const description = store?.description || brand?.description
  const logo = store?.logo || brand?.logo
  const address = addressLine(store?.address)
  const phone = contactValue(store?.contact, ['phone', 'phoneNumber', 'mobile'])
  const email = contactValue(store?.contact, ['email'])
  const hours = store?.businessHours && typeof store.businessHours === 'object' ? store.businessHours : null
  const openDays = hours ? DAYS.filter(([key]) => hours[key] && hours[key].toLowerCase() !== 'closed') : []
  // An older API build answers without shelves; the newest products then
  // simply form one row instead of the page showing an empty shop.
  const rows =
    shelves.length > 0
      ? shelves
      : featuredProducts.length > 0
        ? [{ categoryId: null, name, count: featuredProducts.length, products: featuredProducts }]
        : []

  return (
    <div className="bg-canvas">
      <div className={`${shell} pt-6 sm:pt-8 ${itemCount > 0 ? 'pb-32' : 'pb-16'}`}>
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

        <section className="group relative mt-5 overflow-hidden rounded-[26px] shadow-[0_38px_80px_-42px_rgba(21,20,15,0.7)] ring-1 ring-ink/5">
          <div className="relative h-[232px] bg-noir-soft sm:h-[320px]">
            {banner && (
              <div className="img-zoom absolute inset-0">
                <ProductImage src={banner} name={name} className="h-full w-full" width={1600} />
              </div>
            )}
            <div
              aria-hidden="true"
              className={`absolute inset-0 ${
                banner
                  ? 'bg-gradient-to-t from-noir/90 via-noir/30 to-noir/10'
                  : 'bg-[radial-gradient(120%_120%_at_18%_0%,rgba(28,58,46,0.95),#15140f_72%)]'
              }`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-white/15 transition-transform duration-700 group-hover:scale-105"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border border-white/10"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent"
            />
            <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-cream backdrop-blur-md">
              <MapPin className="h-3 w-3 text-gold" aria-hidden="true" />
              Local store
            </span>
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-4 p-5 sm:p-8">
              <span className="shrink-0 rounded-[18px] bg-gradient-to-br from-clay via-gold to-clay p-[2px] shadow-lg">
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[16px] bg-cream/95 sm:h-20 sm:w-20">
                  {logo ? (
                    <img src={logo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <StoreIcon className="h-7 w-7 text-clay/60" aria-hidden="true" />
                  )}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cream/60">On your block</p>
                <h1 className="font-display mt-1.5 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-cream sm:text-[42px]">
                  {name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {address && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[12px] text-cream/80 backdrop-blur-sm">
                      <MapPin className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                      {address}
                    </span>
                  )}
                  {hours && openDays.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[12px] text-cream/80 backdrop-blur-sm">
                      <Clock className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                      {openDays.length} days a week
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[12px] text-cream/80 backdrop-blur-sm">
                    Cash at the door
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10">
          <div className="min-w-0">
            {description && (
              <p className="max-w-2xl text-[14px] leading-relaxed text-ink/65">{description}</p>
            )}

            <div className="mt-10 flex flex-wrap items-end justify-between gap-3 border-b border-line-warm pb-4">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink/45">On the shelves</p>
                <h2 className="font-display mt-2 text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
                  Fresh from this store
                </h2>
              </div>
              <Link to={`/nearby?q=${encodeURIComponent(brand.name)}`} className="text-[12px] font-medium text-clay underline-offset-4 hover:underline">
                See everything they sell
              </Link>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={StoreIcon}
                title="The shelves are being stocked"
                message="This store has not listed anything yet. Check back soon."
                className="mt-6"
              />
            ) : (
              <div className="-mb-3">
                {rows.map((shelf) => (
                  <ProductShelf key={String(shelf.categoryId ?? shelf.name)} shelf={shelf} brandName={brand.name} />
                ))}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Reveal y={14}>
            <div className="relative overflow-hidden rounded-panel border border-line-warm bg-paper-warm p-5 shadow-[0_28px_60px_-42px_rgba(21,20,15,0.5)]">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent"
              />
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
                <Link
                  to={`/nearby?q=${encodeURIComponent(brand.name)}`}
                  className="shine mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-noir to-forest-deep text-[12px] font-semibold uppercase tracking-[0.1em] text-cream shadow-[0_14px_28px_-16px_rgba(21,20,15,0.8)] transition hover:brightness-110"
                >
                  Shop this store
                </Link>
              </div>
            </div>
            </Reveal>
          </aside>
        </div>
      </div>

      <CartTray />
    </div>
  )
}
