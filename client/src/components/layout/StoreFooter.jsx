import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUp, ArrowUpRight, HandCoins, MapPin, ShieldCheck, Star } from 'lucide-react'
import { useCity } from '../../hooks/useCity'
import { wrap } from '../../ui'

const TRUST = [
  { icon: ShieldCheck, text: 'Verified sellers & pros' },
  { icon: Star, text: 'Reviews from real orders' },
  { icon: HandCoins, text: 'Cash at the door' },
]

function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.5 8.5V6.8c0-.9.3-1.3 1.3-1.3h1.7V2.5h-2.5c-2.6 0-4 1.6-4 4.1v1.9H8.5V12h2.5v9.5h3.5V12h2.6l.4-3.5z" />
    </svg>
  )
}

function LinkedInIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7.5 10.5V20" />
      <path d="M7.5 6.4v.01" />
      <path d="M11.5 20v-9.5" />
      <path d="M11.5 14.6c0-2.6 1.6-4.3 3.9-4.3 2.4 0 3.6 1.7 3.6 4.4V20" />
    </svg>
  )
}

// Placeholder profiles until CityCart has official pages; these become
// superadmin-managed settings once the accounts exist.
const SOCIAL_LINKS = [
  { id: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/', Icon: InstagramIcon },
  { id: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/', Icon: FacebookIcon },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/', Icon: LinkedInIcon },
]

// The giant wordmark at the very bottom. A radial light follows the cursor and
// is clipped to the letters, so only the text lights up as the pointer passes.
function FooterWordmark() {
  const glow = useRef(null)

  function moveGlow(event) {
    const node = glow.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    node.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  return (
    <div className="group relative select-none px-5 pb-10 pt-5" aria-hidden="true" onPointerMove={moveGlow}>
      <div className="relative mx-auto w-full max-w-[1400px]">
        <p className="foot-watermark text-white/[0.06]">
          CityCart<span className="text-clay/30">.</span>
        </p>
        <p
          ref={glow}
          className="foot-watermark foot-watermark-glow absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        >
          CityCart.
        </p>
      </div>
    </div>
  )
}

// "Sell on CityCart" lives here by design — the navbar stays shopper-focused.
export default function StoreFooter({ flush = false }) {
  const { cities, setCityId } = useCity()
  const navigate = useNavigate()

  function pickCity(cityId) {
    setCityId(cityId)
    navigate('/nearby')
  }

  return (
    <footer className={`${flush ? 'mt-0' : 'mt-20'} relative overflow-hidden bg-noir text-white`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[420px] w-[420px] rounded-full bg-clay/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 bottom-32 h-72 w-72 rounded-full bg-cream/5 blur-3xl"
      />

      <div className="relative">
        <div className={wrap}>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-7 border-b border-white/10 pb-12 pt-14 sm:pb-14 sm:pt-16">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/40">
                Start on your street
              </p>
              <h2 className="font-display mt-3 text-[34px] font-normal leading-[1.03] tracking-[-0.03em] sm:text-[46px]">
                Good things,
                <br />
                <em className="font-normal italic text-clay">close to home.</em>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/nearby"
                className="inline-flex h-11 items-center gap-2 rounded-tile bg-cream px-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-noir transition-colors hover:bg-white"
              >
                Shop your block
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                to="/sell"
                className="inline-flex h-11 items-center gap-2 rounded-tile border border-white/20 px-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80 transition-colors hover:border-white/45 hover:bg-white/5 hover:text-white"
              >
                Sell with us
              </Link>
            </div>
          </div>

          <div className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.6fr_0.7fr_0.8fr_0.8fr] lg:gap-8">
            <div className="max-w-[340px]">
              <Link
                to="/"
                className="group inline-flex items-baseline font-display text-[28px] font-semibold tracking-[-0.02em] text-white"
                aria-label="CityCart home"
              >
                <span className="transition-transform duration-300 ease-out group-hover:-translate-y-0.5">CityCart</span>
                <span className="text-clay transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-125 group-hover:drop-shadow-[0_0_7px_rgba(184,71,42,0.55)]">
                  .
                </span>
              </Link>
              <p className="mt-4 text-[13px] leading-relaxed text-white/55">
                The marketplace for your block. Local stores, verified pros, and cash at the door — all within 1.5
                km.
              </p>
              <div className="mt-6 flex items-center gap-2">
                {SOCIAL_LINKS.map(({ id, label, href, Icon }) => (
                  <a
                    key={id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`CityCart on ${label}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/60 transition hover:border-clay hover:bg-clay hover:text-cream"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                ))}
              </div>
              {cities.length > 0 && (
                <div className="mt-6">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">Now serving</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {cities.slice(0, 6).map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => pickCity(c._id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/60 transition hover:border-clay hover:text-white"
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
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">Shop</p>
              <ul className="mt-4 space-y-2 text-[13px]">
                <li>
                  <Link
                    to="/nearby"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Shops near you
                  </Link>
                </li>
                <li>
                  <Link
                    to="/brands"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Brands
                  </Link>
                </li>
                <li>
                  <Link
                    to="/cart"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Cart
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Account">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">Account</p>
              <ul className="mt-4 space-y-2 text-[13px]">
                <li>
                  <Link
                    to="/login"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/register"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Create an account
                  </Link>
                </li>
                <li>
                  <Link
                    to="/orders"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    My orders
                  </Link>
                </li>
                <li>
                  <Link
                    to="/bookings"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    My bookings
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Explore">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">Explore</p>
              <ul className="mt-4 space-y-2 text-[13px]">
                <li>
                  <Link
                    to="/services"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Services & pros
                  </Link>
                </li>
                <li>
                  <Link
                    to="/chat"
                    className="inline-block text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Messages
                  </Link>
                </li>
                <li>
                  <Link
                    to="/sell"
                    className="inline-flex items-center gap-1.5 text-white/70 transition-[color,padding] duration-200 hover:pl-1 hover:text-white"
                  >
                    Sell on CityCart
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-white/10 py-5 text-[11px] text-white/45">
            {TRUST.map(({ icon: Icon, text }, index) => (
              <div key={text} className="flex items-center gap-4">
                {index > 0 && <span aria-hidden="true" className="h-3 w-px bg-white/15" />}
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
                  {text}
                </span>
              </div>
            ))}
            <span className="w-full sm:ml-auto sm:w-auto">
              Built for your block <span className="text-white/75">· one street at a time</span>
            </span>
          </div>
        </div>

        <FooterWordmark />

        <div className={wrap}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-7 text-[11px] text-white/40">
            <p>© {new Date().getFullYear()} CityCart. All rights reserved.</p>
            <p className="hidden sm:block">Cash on delivery on every order</p>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[10.5px] font-medium text-white/60 transition hover:border-white/40 hover:text-white"
            >
              Back to top
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
