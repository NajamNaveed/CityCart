import { Link } from 'react-router-dom'
import { btnCream, btnCreamOutline, sectionLabel, wrap } from '../ui'

const STEPS = [
  ['Apply', 'Tell us about you, your brand and your first store. It is one form, and your store goes live as soon as you submit it.'],
  ['Stock your shelves', 'Create categories, add products with prices and images, and set how many you have in stock.'],
  ['Fulfil orders', 'Accept an order, pack it, hand it to delivery. Customers pay in cash when it arrives.'],
]

const FEATURES = [
  ['Your own storefront', 'Customers in your city find your brand page, browse your products and add them to their cart.'],
  ['Stock that cannot oversell', 'Every order reserves stock the moment it is placed, so two customers can never buy the last item.'],
  ['Only your orders', 'When a customer shops several brands at once, each brand receives its own separate order. You only ever see yours.'],
  ['A team with limits', 'Add employees and choose exactly what each one may do: products, stock, orders or deliveries.'],
  ['Delivery you can follow', 'Move an order from accepted to packed, shipped and delivered, with every step recorded.'],
  ['Cash on delivery, recorded', 'Payment is marked as received when the order is delivered, and refunds are tracked against it.'],
]

const FAQ = [
  ['What do I need to apply?', 'Your name, email and phone number, a brand name and a short description of what you sell, your city, and the name, address and phone number of your first store.'],
  ['How do customers pay?', 'Every order is cash on delivery. Nothing is charged online.'],
  ['Can my staff sign in?', 'Yes. You create employee accounts from your dashboard and decide what each one can do. They sign in on the brand log in page.'],
]

export default function Sell() {
  return (
    <>
      <section className="bg-pine text-cream">
        <div className={`${wrap} grid items-end gap-12 py-20 lg:grid-cols-[1.4fr_1fr] lg:py-28`}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/60">Sell on CityCart</p>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              Open your brand
              <br />
              in your city’s
              <br />
              marketplace.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-cream/80">
              Give your products a storefront, reach shoppers who already browse local brands, and run orders, stock
              and your team from one place.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/sell/apply" className={btnCream}>
                Open your brand
              </Link>
              <a href="#how" className={btnCreamOutline}>
                See how it works
              </a>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-px bg-cream/20 text-sm">
            {[
              ['Setup', 'One form, live on submit'],
              ['Payments', 'Cash on delivery'],
              ['Orders', 'One order per brand'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6 bg-pine py-4">
                <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/60">{k}</dt>
                <dd className="text-right text-base font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="how" className={`${wrap} scroll-mt-24 py-20`}>
        <p className={sectionLabel}>How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          From application to first order in three steps.
        </h2>
        <ol className="mt-12 grid gap-px border border-line bg-line md:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="bg-cream p-8">
              <span className="text-5xl font-light text-pine/40">0{i + 1}</span>
              <h3 className="mt-6 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-sand">
        <div className={`${wrap} py-20`}>
          <p className={sectionLabel}>What you get</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            The tools to run a brand, without the busywork.
          </h2>
          <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, text]) => (
              <div key={title} className="border-t border-pine pt-5">
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${wrap} grid gap-12 py-20 lg:grid-cols-[1fr_1.5fr]`}>
        <div>
          <p className={sectionLabel}>Questions</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Before you apply</h2>
        </div>
        <dl className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-6">
              <dt className="text-base font-semibold">{q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bg-pine text-cream">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-8 py-16`}>
          <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Your customers are already shopping local.
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/sell/apply" className={btnCream}>
              Open your brand
            </Link>
            <Link to="/sell/login" className={btnCreamOutline}>
              Brand log in
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}