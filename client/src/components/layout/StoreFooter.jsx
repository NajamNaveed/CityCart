import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUp, ArrowUpRight, HandCoins, Mail, MapPin, Phone, ShieldCheck, Star, Truck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCity } from '../../hooks/useCity'
import { usePublicSettings } from '../../hooks/usePublicSettings'
import { wrap } from '../../ui'
import { btn, iconBtnLight } from '../../design'

const TRUST = [
  { icon: ShieldCheck, title: 'Verified sellers & pros', text: 'Every store and provider is checked before listing' },
  { icon: Star, title: 'Reviews from real orders', text: 'Only people who bought or booked can review' },
  { icon: HandCoins, title: 'Cash at the door', text: 'Pay when your order or booking arrives' },
  { icon: Truck, title: 'Delivery within 1.5 km', text: 'Local stores, so it reaches you fast' },
]

const linkClass =
  'inline-block text-[13px] text-white/65 transition-[color,transform] duration-200 hover:translate-x-0.5 hover:text-white'

function FooterColumn({ title, links }) {
  return (
    <nav aria-label={title}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{title}</h3>
      <ul className="mt-5 space-y-3">
        {links.map(({ to, label, external }) => (
          <li key={to + label}>
            <Link to={to} className={`${linkClass} ${external ? 'inline-flex items-center gap-1.5' : ''}`}>
              {label}
              {external && <ArrowUpRight className="h-3 w-3" aria-hidden="true" />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

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
  const { user } = useAuth()
  const { settings } = usePublicSettings()
  const navigate = useNavigate()

  const supportEmail = settings?.supportEmail
  const supportPhone = settings?.supportPhone
  const signedIn = Boolean(user)

  function pickCity(cityId) {
    setCityId(cityId)
    navigate('/nearby')
  }

  const marketplace = [
    { to: '/nearby', label: 'Stores near you' },
    { to: '/brands', label: 'All brands' },
    { to: '/services', label: 'Services & pros' },
    { to: '/cart', label: 'Cart' },
  ]

  const account = signedIn
    ? [
        { to: '/orders', label: 'My orders' },
        { to: '/bookings', label: 'My bookings' },
        { to: '/addresses', label: 'Saved addresses' },
        { to: '/chat', label: 'Messages' },
      ]
    : [
        { to: '/login', label: 'Sign in' },
        { to: '/register', label: 'Create an account' },
        { to: '/orders', label: 'Track an order' },
        { to: '/bookings', label: 'My bookings' },
      ]

  const sell = [
    { to: '/sell', label: 'Sell on CityCart', external: true },
    { to: '/sell/apply', label: 'Open a store' },
    { to: '/provider/apply', label: 'Offer your services' },
    { to: '/sell/login', label: 'Seller sign in' },
    { to: '/sell/service/login', label: 'Provider sign in' },
  ]

  const support = [
    { to: '/help', label: 'Help centre' },
    { to: '/contact', label: 'Contact us' },
    { to: '/refund-policy', label: 'Refunds & returns' },
    { to: '/seller-agreement', label: 'Seller agreement' },
    { to: '/provider-agreement', label: 'Provider agreement' },
  ]

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
          {/* 1. Call to action */}
          <div className="flex flex-col gap-8 border-b border-white/10 pb-12 pt-14 sm:pb-14 sm:pt-16 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">Start on your street</p>
              <h2 className="font-display mt-3 text-[34px] font-normal leading-[1.05] tracking-[-0.03em] sm:text-[46px]">
                Good things,
                <br />
                <em className="font-normal italic text-clay">close to home.</em>
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/nearby" className={btn('cream', 'lg')}>
                Shop your block
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link to="/sell" className={btn('outlineLight', 'lg')}>
                Sell with us
              </Link>
            </div>
          </div>

          {/* 2. Trust strip */}
          <ul className="grid gap-px overflow-hidden border-b border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3.5 py-7 sm:pr-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile border border-white/10 bg-white/[0.03]">
                  <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-white/90">{title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/45">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* 3. Brand + link columns */}
          <div className="grid gap-12 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,1fr)] lg:gap-10">
            <div className="sm:col-span-2 lg:col-span-1 lg:max-w-[320px]">
              <Link
                to="/"
                className="group inline-flex items-baseline font-display text-[28px] font-semibold tracking-[-0.02em] text-white"
                aria-label="CityCart home"
              >
                <span className="transition-transform duration-300 ease-out group-hover:-translate-y-0.5">CityCart</span>
                <span className="text-clay transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-125">
                  .
                </span>
              </Link>
              <p className="mt-4 text-[13px] leading-relaxed text-white/55">
                The marketplace for your block. Local stores, verified pros and cash at the door, all within 1.5 km.
              </p>

              {(supportEmail || supportPhone) && (
                <ul className="mt-6 space-y-2.5 text-[13px] text-white/65">
                  {supportEmail && (
                    <li>
                      <a
                        href={`mailto:${supportEmail}`}
                        className="inline-flex items-center gap-2.5 break-all transition hover:text-white"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0 text-clay" aria-hidden="true" />
                        {supportEmail}
                      </a>
                    </li>
                  )}
                  {supportPhone && (
                    <li>
                      <a
                        href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-2.5 transition hover:text-white"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0 text-clay" aria-hidden="true" />
                        {supportPhone}
                      </a>
                    </li>
                  )}
                </ul>
              )}

              <div className="mt-6 flex items-center gap-2">
                {SOCIAL_LINKS.map(({ id, label, href, Icon }) => (
                  <a
                    key={id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`CityCart on ${label}`}
                    className={iconBtnLight}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </a>
                ))}
              </div>

              {cities.length > 0 && (
                <div className="mt-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Now serving</p>
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

            <FooterColumn title="Marketplace" links={marketplace} />
            <FooterColumn title="Your account" links={account} />
            <FooterColumn title="Sell with us" links={sell} />
            <FooterColumn title="Support" links={support} />
          </div>
        </div>

        <FooterWordmark />

        {/* 4. Bottom bar */}
        <div className={wrap}>
          <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-[12px] text-white/45 md:flex-row md:items-center md:justify-between">
            <p>&copy; {new Date().getFullYear()} CityCart. All rights reserved.</p>

            <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link to="/privacy" className="transition hover:text-white">
                Privacy
              </Link>
              <Link to="/terms" className="transition hover:text-white">
                Terms
              </Link>
              <Link to="/refund-policy" className="transition hover:text-white">
                Returns
              </Link>
              <Link to="/help" className="transition hover:text-white">
                Help
              </Link>
            </nav>

            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] font-medium text-white/60 transition hover:border-white/40 hover:text-white"
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
