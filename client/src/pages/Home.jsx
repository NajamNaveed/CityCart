import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import { useCity } from '../hooks/useCity'
import { useBrands } from '../hooks/useBrands'
import ProductCard from '../components/ProductCard'
import { useRatings } from '../hooks/useRatings'
import ProductImage from '../components/ProductImage'
import SectionHeader from '../components/SectionHeader'
import { btnOutline, btnPrimary, formatPrice, sectionLabel, wrap } from '../ui'

const TRUST = [
  ['Pay on delivery', 'Every order is cash on delivery. Nothing is charged until it reaches you.'],
  ['One cart, many brands', 'Add products from several brands at once. Each brand prepares and ships its own order.'],
  ['Local first', 'Pick your city and see the brands that sell there.'],
]

function BrandTile({ brand }) {
  return (
    <Link
      to={`/shop?brandId=${brand._id}`}
      className="group block border border-line bg-paper transition hover:border-ink"
    >
      <div className="flex h-28 items-center justify-center bg-sand">
        {brand.logo ? (
          <img src={brand.logo} alt="" className="max-h-16 max-w-[70%] object-contain" />
        ) : (
          <span className="text-4xl font-light tracking-widest text-clay/50">{brand.name[0].toUpperCase()}</span>
        )}
      </div>
      <div className="p-4">
        <p className="text-[15px] font-semibold">{brand.name}</p>
        {brand.description && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{brand.description}</p>}
      </div>
    </Link>
  )
}

export default function Home() {
  const { city, cityId } = useCity()
  const { brands, loading: brandsLoading } = useBrands(cityId)
  const [result, setResult] = useState({ key: null, items: [] })
  const key = cityId || 'all'
  const location = useLocation()

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

  // Footer links like /#brands: React Router does not scroll to hashes on its own.
  useEffect(() => {
    if (location.hash && !brandsLoading) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView()
    }
  }, [location.hash, brandsLoading])

  const loading = result.key !== key
  const products = result.items
  const brandName = Object.fromEntries(brands.map((b) => [b._id, b.name]))
  const ratings = useRatings(products.map((p) => p._id))
  const featured = products.slice(0, 2)

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line">
        <div className={`${wrap} grid items-center gap-12 py-14 lg:grid-cols-[1.15fr_1fr] lg:py-20`}>
          <div>
            <p className={sectionLabel}>{city ? `Shopping in ${city.name}` : 'The CityCart marketplace'}</p>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              Local brands.
              <br />
              One cart.
              <br />
              <span className="text-clay">Paid on delivery.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-muted">
              Browse independent brands in your city, fill a single cart from several of them, and pay in cash
              when your order arrives.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/shop" className={btnPrimary}>
                Shop all products
              </Link>
              <a href="#brands" className={btnOutline}>
                Browse brands
              </a>
            </div>
          </div>

          {featured.length === 2 && (
            <div className="grid grid-cols-2 gap-4">
              {featured.map((p, i) => (
                <Link key={p._id} to={`/product/${p._id}`} className={`group block ${i === 1 ? 'mt-12' : ''}`}>
                  <div className="overflow-hidden bg-sand">
                    <ProductImage
                      src={p.images?.[0]}
                      name={p.name}
                      className="aspect-[3/4] w-full transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-3 line-clamp-1 text-sm font-medium">{p.name}</p>
                  <p className="text-sm text-muted">{formatPrice(p.price)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Brands */}
      <section id="brands" className={`${wrap} scroll-mt-28 pt-16`}>
        <SectionHeader title={city ? `Brands in ${city.name}` : 'Brands on CityCart'} />
        {brandsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse bg-sand" />
            ))}
          </div>
        ) : brands.length === 0 ? (
          <p className="text-muted">No brands are selling here yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {brands.slice(0, 8).map((b) => (
              <BrandTile key={b._id} brand={b} />
            ))}
          </div>
        )}
      </section>

      {/* New arrivals */}
      <section className={`${wrap} pt-16`}>
        <SectionHeader title="New arrivals" to="/shop" linkLabel="View all products" />
        {loading ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-[4/5] animate-pulse bg-sand" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-muted">No products have been listed yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p._id} product={p} brandName={brandName[p.brandId]} rating={ratings[p._id]} />
            ))}
          </div>
        )}
      </section>

      {/* Why CityCart */}
      <section className={`${wrap} pt-20`}>
        <div className="grid gap-px border border-line bg-line md:grid-cols-3">
          {TRUST.map(([title, text]) => (
            <div key={title} className="bg-cream p-8">
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}