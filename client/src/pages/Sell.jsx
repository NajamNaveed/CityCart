import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Banknote, PackageCheck, ShoppingBag, Store, Truck, Users } from 'lucide-react'
import { Reveal } from '../components/ui'
import { btnCream, btnCreamOutline, sectionLabel, wrap } from '../ui'

const STEPS = [
  ['Apply', 'Tell us about you, your brand and your first store. It is one form, and your store goes live as soon as you submit it.'],
  ['Stock your shelves', 'Create categories, add products with prices and images, and set how many you have in stock.'],
  ['Fulfil orders', 'Accept an order, pack it, hand it to delivery. Customers pay in cash when it arrives.'],
]

const FEATURES = [
  { icon: Store, title: 'Your own storefront', text: 'Customers in your city find your brand page, browse your products and add them to your cart.' },
  { icon: PackageCheck, title: 'Stock that cannot oversell', text: 'Every order reserves stock the moment it is placed, so two customers can never buy the last item.' },
  { icon: ShoppingBag, title: 'Only your orders', text: 'When a customer shops several brands at once, each brand receives its own separate order. You only ever see yours.' },
  { icon: Users, title: 'A team with limits', text: 'Add employees and choose exactly what each one may do: products, stock, orders or deliveries.' },
  { icon: Truck, title: 'Delivery you can follow', text: 'Move an order from accepted to packed, shipped and delivered, with every step recorded.' },
  { icon: Banknote, title: 'Cash on delivery, recorded', text: 'Payment is marked as received when the order is delivered, and refunds are tracked against it.' },
]

const FAQ = [
  ['What do I need to apply?', 'Your name, email and phone number, a brand name and a short description of what you sell, your city, and the name, address and phone number of your first store.'],
  ['How do customers pay?', 'Every order is cash on delivery. Nothing is charged online.'],
  ['Can my staff sign in?', 'Yes. You create employee accounts from your dashboard and decide what each one can do. They sign in on the brand log in page.'],
]

export default function Sell() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-pine/60 blur-3xl"
        />
        <div className={`${wrap} relative grid items-end gap-12 py-20 lg:grid-cols-[1.4fr_1fr] lg:py-28`}>
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">Sell on CityCart</p>
            <h1 className="font-display mt-5 text-[42px] font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              Open your brand
              <br />
              in your city&rsquo;s
              <br />
              <span className="text-cream/85">marketplace.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[16.5px] leading-relaxed text-white/70">
              Give your products a storefront, reach shoppers who already browse local brands, and run orders, stock
              and your team from one place.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/sell/apply" className={btnCream}>
                Open your brand
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href="#how" className={btnCreamOutline}>
                See how it works
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-white/15 text-sm">
              {[
                ['Setup', 'One form, live on submit'],
                ['Payments', 'Cash on delivery'],
                ['Orders', 'One order per brand'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-6 bg-ink/95 px-5 py-4">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">{k}</dt>
                  <dd className="text-right text-[15px] font-medium text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className={`${wrap} scroll-mt-24 py-20`}>
        <Reveal>
          <p className={sectionLabel}>How it works</p>
          <h2 className="font-display mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            From application to first order in three steps.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <Reveal key={title} delay={i * 0.08} className="h-full">
              <div className="h-full rounded-lg border border-line bg-white p-7">
                <span className="font-display text-5xl font-light text-pine/30">0{i + 1}</span>
                <h3 className="mt-6 text-[16px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mt-6 border-y border-line bg-sand/60">
        <div className={`${wrap} py-20`}>
          <Reveal>
            <p className={sectionLabel}>What you get</p>
            <h2 className="font-display mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              The tools to run a brand, without the busywork.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={Math.min(i, 5) * 0.06}>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-pine shadow-sm shadow-ink/5">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-[15.5px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${wrap} grid gap-12 py-20 lg:grid-cols-[1fr_1.5fr]`}>
        <Reveal>
          <p className={sectionLabel}>Questions</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink">Before you apply</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <dl className="divide-y divide-line rounded-lg border border-line bg-white px-6">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-6">
                <dt className="text-[15.5px] font-semibold text-ink">{q}</dt>
                <dd className="mt-2 text-[13.5px] leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* Closing band */}
      <section className={`${wrap} pb-4`}>
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-pine px-6 py-16 text-center text-white sm:px-14">
            <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cream/10 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-black/20 blur-3xl" />
            <div className="relative">
              <h2 className="font-display mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Your customers are already shopping local.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-[15px] text-white/70">
                One form is all it takes to put your brand in front of them.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/sell/apply" className={btnCream}>
                  Open your brand
                </Link>
                <Link to="/sell/login" className={btnCreamOutline}>
                  Brand log in
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
