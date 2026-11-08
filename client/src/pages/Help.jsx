import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  CalendarCheck,
  ChevronRight,
  LifeBuoy,
  Mail,
  Package,
  Plus,
  ShoppingBag,
  Store,
  UserRound,
  Wrench,
} from 'lucide-react'
import { usePublicSettings } from '../hooks/usePublicSettings'
import { usePageMeta } from '../hooks/usePageMeta'
import { Button, eyebrow, lede, shell, textLink } from '../design'

const TOPICS = [
  {
    icon: Package,
    title: 'Orders & delivery',
    text: 'Track a parcel, check what is due at the door, or report something missing.',
    to: '/orders',
    action: 'Open my orders',
  },
  {
    icon: CalendarCheck,
    title: 'Bookings & services',
    text: 'See your slots, price proposals and the chat with your provider.',
    to: '/bookings',
    action: 'Open my bookings',
  },
  {
    icon: ShoppingBag,
    title: 'Cart & checkout',
    text: 'How the cart works across several shops, and what happens when you place an order.',
    to: '/cart',
    action: 'Go to cart',
  },
  {
    icon: Store,
    title: 'Selling on CityCart',
    text: 'Open a store, offer a service, or sign in to a seller workspace.',
    to: '/sell',
    action: 'See seller options',
  },
]

const FAQ = [
  {
    q: 'How does cash on delivery work?',
    a: 'You pay the rider in cash at your door. CityCart does not hold your money. The order page shows the amount due, and the rider records the payment when it is collected.',
  },
  {
    q: 'Which areas can I order from?',
    a: 'Every store and professional serves a specific city block, and deliveries are limited to a short radius around that store. Choose your city in Stores or Services to see who serves your area.',
  },
  {
    q: 'Can I order from more than one shop at once?',
    a: 'Yes. One cart can include products from several shops. Each shop receives its own order, so parcels can arrive separately and are confirmed by each seller.',
  },
  {
    q: 'Something arrived damaged or missing. What now?',
    a: 'Open the order and report the problem against the affected item. Keep the packaging and the item as they arrived. The seller reviews the report and CityCart support can step in if you cannot agree.',
  },
  {
    q: 'How do I book a service?',
    a: 'Choose a provider, pick an available date and time, and describe the job. The provider can accept the request or send a price proposal. Everything stays in the booking thread, including chat.',
  },
  {
    q: 'How do I cancel an order or booking?',
    a: 'Open the order or booking and use Cancel while the option is shown. Once a seller has accepted or work has started, message them from the order or booking so the cancellation can be agreed between you.',
  },
  {
    q: 'How do I become a seller?',
    a: 'Shops and service providers both start at Sell on CityCart. A shop can open after verifying its email; service providers are reviewed by the CityCart team before appearing to customers.',
  },
]

function SupportCard({ supportEmail }) {
  return (
    <div className="rounded-card border border-line-warm bg-canvas p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-tile bg-sand text-clay">
        <LifeBuoy className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className={`mt-4 ${eyebrow}`}>Still stuck?</p>
      <h2 className="font-display mt-2 text-[21px] font-semibold tracking-[-0.01em] text-ink">
        Write to the support team
      </h2>
      {supportEmail ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/60">
            Include your order or booking number so we can find the right seller.
          </p>
          <Button href={`mailto:${supportEmail}`} tone="noir" size="md" className="mt-4 w-full">
            <Mail className="h-4 w-4" aria-hidden="true" />
            Email support
          </Button>
          <a href={`mailto:${supportEmail}`} className={`mt-3 block break-all text-center ${textLink}`}>
            {supportEmail}
          </a>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-ink/60">
          The public support address is being set up. For an existing order, use Messages on the order to reach the
          seller directly.
        </p>
      )}
      <Link to="/contact" className={`mt-4 inline-flex items-center gap-1.5 ${textLink}`}>
        All contact options
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

export default function Help() {
  const { settings } = usePublicSettings()

  usePageMeta({
    title: 'Help centre',
    description: 'Answers about orders, bookings, the cart and selling on CityCart — plus the quickest way to reach a person.',
  })

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-6 sm:pt-8`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink/45">
          <Link to="/" className="transition hover:text-ink">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-ink/70" aria-current="page">
            Help
          </span>
        </nav>

        <section className="mt-5 grid gap-6 rounded-panel border border-line-warm bg-sand p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-10">
          <div>
            <p className={eyebrow}>Help centre</p>
            <h1 className="font-display mt-3 text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink sm:text-[46px]">
              A quick answer,
              <br />
              <em className="font-normal italic text-clay">before the queue.</em>
            </h1>
            <p className={`mt-4 max-w-xl ${lede}`}>
              Start with the topics below. Most questions about orders, bookings, cash payment and selling are answered
              here — and if yours is not, the support address is one click away.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button to="/contact" tone="noir" size="md">
                Contact support
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button to="/nearby" tone="outline" size="md">
                Browse stores
              </Button>
            </div>
          </div>
          <SupportCard supportEmail={settings.supportEmail} />
        </section>

        <section className="mt-12" aria-labelledby="help-topics">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={eyebrow}>Start here</p>
              <h2 id="help-topics" className="font-display mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[30px]">
                Pick the closest thing
              </h2>
            </div>
            <p className="text-[12px] text-muted">Most links open your account — sign in when asked.</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TOPICS.map(({ icon: Icon, title, text, to, action }) => (
              <Link
                key={title}
                to={to}
                className="group flex h-full flex-col rounded-card border border-line-warm bg-paper-warm p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_45px_rgba(21,20,15,0.09)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-tile bg-sand text-clay">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-display mt-4 text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
                <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-ink/60">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-clay">
                  {action}
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12" aria-labelledby="help-questions">
          <div>
            <p className={eyebrow}>Common questions</p>
            <h2 id="help-questions" className="font-display mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[30px]">
              The ones we hear most
            </h2>
            <div className="mt-4 border-t border-line-warm">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group border-b border-line-warm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[14px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {q}
                    <Plus className="h-4 w-4 shrink-0 text-clay transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
                  </summary>
                  <p className="max-w-2xl pb-4 text-[13px] leading-relaxed text-ink/65">{a}</p>
                </details>
              ))}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-card border border-line-warm bg-paper-warm p-5">
              <p className={eyebrow}>For sellers & pros</p>
              <ul className="mt-3 space-y-2.5 text-[13px] text-ink/65">
                <li>
                  <Link to="/sell/apply" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <Store className="h-4 w-4 text-clay" aria-hidden="true" />
                    Open a store
                  </Link>
                </li>
                <li>
                  <Link to="/provider/apply" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <Wrench className="h-4 w-4 text-clay" aria-hidden="true" />
                    Apply as a provider
                  </Link>
                </li>
                <li>
                  <Link to="/sell/login" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <UserRound className="h-4 w-4 text-clay" aria-hidden="true" />
                    Seller sign in
                  </Link>
                </li>
                <li>
                  <Link to="/seller-agreement" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <Banknote className="h-4 w-4 text-clay" aria-hidden="true" />
                    Seller agreement
                  </Link>
                </li>
              </ul>
            </div>
            <div className="rounded-card border border-line-warm bg-paper-warm p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-sand text-clay">
                <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className={`mt-3 ${eyebrow}`}>Need a person?</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink/60">
                Support can look at the order, the delivery record and the conversation with you.
              </p>
              <Link to="/contact" className={`mt-3 inline-flex items-center gap-1.5 ${textLink}`}>
                Contact options
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
