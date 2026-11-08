import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Mail, MessageCircle, Package, Phone, Store, Wrench } from 'lucide-react'
import { usePublicSettings } from '../hooks/usePublicSettings'
import { usePageMeta } from '../hooks/usePageMeta'
import { Button, eyebrow, lede, shell, textLink } from '../design'

const INCLUDE = [
  'Your order or booking number — it sits at the top of its page.',
  'The email address on your CityCart account.',
  'What happened, and the date it happened.',
  'Photos, if something arrived damaged or different from the listing.',
]

const DIRECTIONS = [
  {
    icon: Package,
    title: 'An order in progress',
    text: 'Use Messages on the order first. The seller and rider can see it there, with the order attached.',
    to: '/orders',
    action: 'Open my orders',
  },
  {
    icon: MessageCircle,
    title: 'A booking or a quote',
    text: 'Booking chat keeps the date, the price proposal and the provider in one place.',
    to: '/bookings',
    action: 'Open my bookings',
  },
  {
    icon: Store,
    title: 'Your store or service profile',
    text: 'Seller questions, commission and payouts are covered by the seller agreement and Help.',
    to: '/help',
    action: 'Seller help',
  },
]

export default function Contact() {
  const { settings } = usePublicSettings()
  const email = settings.supportEmail
  const phone = settings.supportPhone

  usePageMeta({
    title: 'Contact support',
    description: 'Reach the CityCart support team about an order, a booking or a seller account — and what to include so it is fixed in one reply.',
  })

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-6 sm:pt-8`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink/45">
          <Link to="/" className="transition hover:text-ink">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link to="/help" className="transition hover:text-ink">
            Help
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="text-ink/70" aria-current="page">
            Contact
          </span>
        </nav>

        <header className="mt-6 max-w-2xl">
          <p className={eyebrow}>Contact</p>
          <h1 className="font-display mt-3 text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink sm:text-[46px]">
            Talk to a person,
            <br />
            <em className="font-normal italic text-clay">not a ticket number.</em>
          </h1>
          <p className={`mt-4 ${lede}`}>
            One support address reaches the CityCart team. Tell us which order or booking it is about and we will pick
            it up from there.
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          <div className="space-y-6">
            <section className="rounded-panel border border-line-warm bg-paper-warm p-6 sm:p-8" aria-labelledby="support-email">
              <p className={eyebrow}>Customer support</p>
              <h2 id="support-email" className="font-display mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
                {email ? 'Email us' : 'The support address is being set up'}
              </h2>

              {email ? (
                <>
                  <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink/65">
                    Write from the email address on your account so we can match you to the order. For a live order,
                    Messages on the order page is usually faster — the seller and rider are already there.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button href={`mailto:${email}`} tone="noir" size="md">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Email support
                    </Button>
                    <a href={`mailto:${email}`} className={`break-all text-[13.5px] ${textLink}`}>
                      {email}
                    </a>
                  </div>
                  {phone && (
                    <p className="mt-4 inline-flex items-center gap-2 text-[13px] text-ink/60">
                      <Phone className="h-4 w-4 text-clay" aria-hidden="true" />
                      <a href={`tel:${phone.replace(/\s+/g, '')}`} className={textLink}>
                        {phone}
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink/65">
                  CityCart has not published a public support address yet. In the meantime, open the order or booking
                  and use Messages to reach the seller or provider directly, and check the{' '}
                  <Link to="/help" className={textLink}>
                    Help centre
                  </Link>{' '}
                  for the answer.
                </p>
              )}
            </section>

            <section className="rounded-panel border border-line-warm bg-sand p-6 sm:p-8" aria-labelledby="what-to-include">
              <p className={eyebrow}>Before you write</p>
              <h2 id="what-to-include" className="font-display mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">
                Include these four things
              </h2>
              <ol className="mt-5 space-y-3.5">
                {INCLUDE.map((item, index) => (
                  <li key={item} className="flex gap-3 text-[13.5px] leading-relaxed text-ink/70">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper-warm text-[11px] font-semibold text-clay">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[12px] leading-relaxed text-muted">
                Never send passwords, one-time codes or full card numbers. CityCart support will not ask for them.
              </p>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-card border border-line-warm bg-paper-warm p-5">
              <p className={eyebrow}>Where to go first</p>
              <ul className="mt-4 space-y-4">
                {DIRECTIONS.map(({ icon: Icon, title, text, to, action }) => (
                  <li key={title}>
                    <Link to={to} className="group block">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                        <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                        {title}
                      </span>
                      <span className="mt-1 block pl-6 text-[12px] leading-relaxed text-ink/55">{text}</span>
                      <span className="mt-1.5 inline-flex items-center gap-1 pl-6 text-[11.5px] font-medium text-clay">
                        {action}
                        <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-card border border-line-warm bg-paper-warm p-5">
              <p className={eyebrow}>Sellers & providers</p>
              <ul className="mt-3 space-y-2.5 text-[13px] text-ink/65">
                <li>
                  <Link to="/seller-agreement" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <Store className="h-4 w-4 text-clay" aria-hidden="true" />
                    Seller agreement
                  </Link>
                </li>
                <li>
                  <Link to="/provider-agreement" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <Wrench className="h-4 w-4 text-clay" aria-hidden="true" />
                    Provider agreement
                  </Link>
                </li>
                <li>
                  <Link to="/refund-policy" className="inline-flex items-center gap-2 transition hover:text-ink">
                    <Package className="h-4 w-4 text-clay" aria-hidden="true" />
                    Refund & returns
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
