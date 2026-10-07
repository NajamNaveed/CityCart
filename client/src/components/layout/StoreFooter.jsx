import { Link, useNavigate } from 'react-router-dom'
import { ArrowUp, ArrowUpRight, MapPin } from 'lucide-react'
import { useCity } from '../../hooks/useCity'
import { wrap } from '../../ui'

// "Sell on CityCart" lives here by design — the navbar stays shopper-focused.
export default function StoreFooter() {
  const { cities, setCityId } = useCity()
  const navigate = useNavigate()

  function pickCity(cityId) {
    setCityId(cityId)
    navigate('/shop')
  }

  return (
    <footer className="mt-24 bg-ink text-white">
      <div className={`${wrap} grid gap-12 py-16 md:grid-cols-[1.5fr_1fr_1fr_1.3fr]`}>
        <div>
          <p className="text-[24px] font-semibold tracking-tight">
            citycart<span className="text-clay">.</span>
          </p>
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-white/60">
            A marketplace for local brands. Shop by city, fill one cart from several of them, and pay when your
            order arrives.
          </p>
          {cities.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">Now serving</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {cities.slice(0, 6).map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => pickCity(c._id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[12px] text-white/70 transition hover:border-clay hover:text-white"
                  >
                    <MapPin className="h-3 w-3 text-clay" aria-hidden="true" />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <nav aria-label="Shop">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">Shop</p>
          <ul className="mt-4 space-y-2.5 text-[13.5px]">
            <li>
              <Link to="/shop" className="text-white/75 transition hover:text-white">
                All products
              </Link>
            </li>
            <li>
              <Link to="/brands" className="text-white/75 transition hover:text-white">
                Brands
              </Link>
            </li>
            <li>
              <Link to="/cart" className="text-white/75 transition hover:text-white">
                Cart
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Account">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">Account</p>
          <ul className="mt-4 space-y-2.5 text-[13.5px]">
            <li>
              <Link to="/login" className="text-white/75 transition hover:text-white">
                Sign in
              </Link>
            </li>
            <li>
              <Link to="/register" className="text-white/75 transition hover:text-white">
                Create an account
              </Link>
            </li>
            <li>
              <Link to="/orders" className="text-white/75 transition hover:text-white">
                My orders
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">Sell on CityCart</p>
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-white/60">
            Run a local brand? Get your own storefront, take orders and manage delivery — in your city.
          </p>
          <Link
            to="/sell"
            className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-md bg-cream px-5 text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink transition hover:bg-white"
          >
            Start selling
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-white/40`}>
          <p>© {new Date().getFullYear()} CityCart</p>
          <p>Cash on delivery on every order</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:border-white/40 hover:text-white"
          >
            Back to top
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  )
}
