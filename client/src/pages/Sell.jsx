import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Banknote,
  Check,
  PackageCheck,
  Percent,
  ReceiptText,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Wrench,
} from 'lucide-react'
import { Reveal } from '../components/ui'
import {
  SectionHead,
  accent,
  body,
  btn,
  display,
  eyebrow,
  eyebrowOnDark,
  lede,
  shell as SHELL,
  textLink,
} from '../design'

const TRUST = [
  { icon: Percent, text: '1% per completed sale' },
  { icon: ReceiptText, text: 'No listing or monthly fee' },
  { icon: Banknote, text: 'Cash at the door — yours' },
]

const DOORS = [
  {
    id: 'products',
    icon: Store,
    eyebrow: 'For shops & studios',
    title: 'Sell products',
    text: 'A storefront for what you make or stock. Customers browse your shelf from their block and check out across several shops at once.',
    points: [
      'Your own brand page and storefront',
      'Stock that is reserved the moment an order is placed',
      'One order per brand — only yours arrives',
      'Team accounts with per-person limits',
    ],
    cta: { to: '/sell/apply', label: 'Open your store' },
    login: { to: '/sell/login', label: 'Brand log in' },
    tone: 'light',
  },
  {
    id: 'services',
    icon: Wrench,
    eyebrow: 'For plumbers, cleaners & pros',
    title: 'Offer services',
    text: 'A profile customers can book, one block at a time. They see your starting price, pick a slot and agree the details with you.',
    points: [
      'A public profile with your starting price',
      'Bookings inside the block you work in',
      'Proposals, chat and completion in one thread',
      'Reviews from real, completed jobs',
    ],
    cta: { to: '/provider/apply', label: 'Apply as a provider' },
    login: { to: '/sell/service/login', label: 'Provider log in' },
    tone: 'dark',
  },
]

const STEPS = [
  [
    'Apply once',
    'One form creates your account and your first shop — or your service profile. Add the block you work from as you go.',
  ],
  [
    'Set out your shelf',
    'Add products with prices and photos, or list your services with a starting price. Stock is reserved at checkout, so nothing oversells.',
  ],
  [
    'Get paid at the door',
    'Accept the order or confirm the slot, then hand it over. Customers pay in cash — CityCart never holds your money.',
  ],
]

const FEATURES = [
  { icon: PackageCheck, title: 'Stock that cannot oversell', text: 'Every order reserves stock the moment it is placed, so two customers can never buy the last item.' },
  { icon: ShoppingBag, title: 'Only your orders', text: 'When a customer shops several brands at once, each brand receives its own separate order. You only ever see yours.' },
  { icon: Users, title: 'A team with limits', text: 'Add employees and choose exactly what each one may do: products, stock, orders or deliveries.' },
  { icon: Truck, title: 'Delivery you can follow', text: 'Move an order from accepted to packed, shipped and delivered, with every step recorded.' },
]

const ORDERS = [
  { name: 'Ayesha Malik', item: 'Stoneware set ×2', total: 'PKR 2,900', when: 'just now' },
  { name: 'Farah Khan', item: 'Mug ×1', total: 'PKR 1,450', when: '12 min' },
  { name: 'Hamza R.', item: 'Vase ×1', total: 'PKR 3,200', when: '28 min' },
]

const STATS = [
  ['1%', 'of each completed sale'],
  ['PKR 0', 'to list or join'],
  ['1.5 km', 'your whole market'],
]

const FAQ = [
  [
    'What do I need to apply?',
    'Your name, email and phone number, and a password. Shops add a brand name, a short description, their city and their first shop. Service providers add a service name, a category, a starting price and the block they work in.',
  ],
  [
    'How do customers pay?',
    'At the door. Orders are cash on delivery and service jobs are settled directly with the customer. CityCart does not hold your money or run an escrow.',
  ],
  [
    'What does CityCart charge?',
    '1% of each completed order or booking, invoiced monthly. There is no listing fee, no monthly fee and no ad spend.',
  ],
  [
    'When do I appear to customers?',
    'Shops go live as soon as the owner verifies their email. Service providers are reviewed by a CityCart admin first, then appear to customers in their block.',
  ],
  [
    'Can my staff sign in?',
    'Yes. You create employee accounts from your dashboard and choose what each one may do. They sign in on the brand log in page.',
  ],
  [
    'Can I do both products and services?',
    'They are separate accounts, because a shop and a service profile are different businesses. If you do both, apply with a different email for each one.',
  ],
]

function ActivityRow({ icon: Icon, label, name, detail, amount, when }) {
  return (
    <div className="flex items-center gap-3 rounded-tile border border-line-warm bg-paper-warm px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-sand text-clay">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-semibold text-ink">{name}</span>
          <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink/45">
            {label}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-ink/50">{detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[12px] font-semibold tabular-nums text-ink">{amount}</span>
        <span className="block text-[10px] text-ink/40">{when}</span>
      </span>
    </div>
  )
}

function SellerDayBoard() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-panel border border-line-warm bg-sand/70 p-4 shadow-[0_24px_60px_rgba(21,20,15,0.10)] sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-paper-warm/80 blur-3xl"
        />
        <div className="relative flex items-center justify-between gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45">Your counter</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-warm bg-paper-warm px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink/55">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sage ring-4 ring-sage/30" />
            Live
          </span>
        </div>

        <p className="font-display relative mt-4 text-[26px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[30px]">
          A quiet morning, <em className="font-normal italic text-clay">handled.</em>
        </p>
        <p className="relative mt-2 max-w-[34ch] text-[12.5px] leading-relaxed text-ink/55">
          Product orders and service bookings land in the same day, on the same street.
        </p>

        <div className="relative mt-5 space-y-2.5">
          <ActivityRow
            icon={ShoppingBag}
            label="Shop"
            name="Ayesha Malik"
            detail="Stoneware set ×2 · collect in 25 min"
            amount="PKR 2,900"
            when="2 min ago"
          />
          <ActivityRow
            icon={Wrench}
            label="Service"
            name="Hamza R."
            detail="Deep clean · Saturday, 10:00"
            amount="PKR 4,500"
            when="18 min ago"
          />
        </div>

        <div className="relative mt-4 flex items-center justify-between rounded-tile border border-line-warm bg-paper-warm px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Paid at the door</span>
          <span className="text-[12px] font-semibold tabular-nums text-ink">PKR 7,400 today</span>
        </div>
      </div>
      <div className="absolute -bottom-4 right-4 hidden rotate-[1.5deg] rounded-tile border border-line-warm bg-paper-warm px-4 py-2.5 shadow-[0_18px_40px_rgba(21,20,15,0.14)] sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Every completed sale</p>
        <p className="mt-0.5 text-[12px] font-medium text-ink">1% · PKR 0 to list</p>
      </div>
    </div>
  )
}

function DashboardMock() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-panel bg-noir p-5 text-cream shadow-[0_30px_70px_rgba(21,20,15,0.25)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cream/40">This month</p>
            <p className="font-display mt-2 text-[30px] font-semibold leading-none tracking-tight sm:text-[34px]">
              PKR 184,500
            </p>
            <p className="mt-2 text-[11.5px] text-cream/50">Clay House Studio</p>
          </div>
          <span className="rounded-full bg-sage/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sage">
            +18%
          </span>
        </div>

        <div className="mt-5 border-t border-cream/10 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cream/40">Today’s orders</p>
            <p className="text-[10.5px] text-cream/35">3 new</p>
          </div>
          <ul className="mt-3 space-y-3">
            {ORDERS.map((order) => (
              <li key={order.name} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-cream">{order.name}</span>
                  <span className="block truncate text-[10.5px] text-cream/45">{order.item}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-semibold tabular-nums text-cream/90">{order.total}</span>
                  <span className="block text-[10px] text-cream/35">{order.when}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-tile bg-cream/5 px-3 py-2.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-cream/45">Paid at door</span>
          <span className="text-[11px] font-medium text-cream/75">PKR 7,550 today</span>
        </div>
      </div>
      <div className="absolute -bottom-5 -right-3 hidden rotate-[2deg] rounded-tile border border-line-warm bg-paper-warm px-4 py-3 shadow-[0_18px_40px_rgba(21,20,15,0.16)] sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Billing</p>
        <p className="mt-1 text-[12px] font-medium text-ink">1% · invoiced monthly</p>
      </div>
    </div>
  )
}

function DoorCard({ door, index }) {
  const Icon = door.icon
  const dark = door.tone === 'dark'
  return (
    <Reveal delay={index * 0.08} className="h-full">
      <article
        className={`relative flex h-full flex-col overflow-hidden rounded-panel p-6 sm:p-8 ${
          dark ? 'bg-forest-deep text-cream' : 'border border-line-warm bg-paper-warm'
        }`}
      >
        {dark && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sage/10 blur-3xl"
          />
        )}
        <div className="relative flex items-start justify-between gap-4">
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-tile ${
              dark ? 'border border-cream/15 bg-cream/5 text-cream' : 'bg-sand text-clay'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${dark ? 'text-cream/40' : 'text-ink/40'}`}
          >
            {door.eyebrow}
          </span>
        </div>

        <h3 className="font-display relative mt-6 text-[30px] font-semibold leading-none tracking-tight sm:text-[34px]">
          {door.title}
        </h3>
        <p className={`relative mt-3 max-w-sm text-[13px] leading-relaxed ${dark ? 'text-cream/60' : 'text-ink/60'}`}>
          {door.text}
        </p>

        <ul className="relative mt-6 space-y-2.5">
          {door.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
              <span
                className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full ${
                  dark ? 'bg-cream/10 text-cream' : 'bg-sage text-forest'
                }`}
              >
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className={dark ? 'text-cream/75' : 'text-ink/70'}>{point}</span>
            </li>
          ))}
        </ul>

        <div className="relative mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-8">
          <Link to={door.cta.to} className={btn(dark ? 'cream' : 'noir', 'md')}>
            {door.cta.label}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link
            to={door.login.to}
            className={`text-[12px] font-medium underline-offset-4 transition hover:underline ${
              dark ? 'text-cream/55 hover:text-cream' : 'text-ink/50 hover:text-ink'
            }`}
          >
            {door.login.label}
          </Link>
        </div>
      </article>
    </Reveal>
  )
}

export default function Sell() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line-warm bg-canvas" aria-labelledby="sell-title">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-[#fdf6ea] blur-3xl"
        />

        <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <div className="relative z-10 min-w-0">
            <p className={eyebrow}>Sell on CityCart</p>
            <h1
              id="sell-title"
              className="font-display mt-5 text-[42px] font-semibold leading-[0.96] tracking-[-0.035em] text-ink sm:text-[58px] lg:text-[66px]"
            >
              Your street already trusts you.{' '}
              <em className="font-normal italic text-clay">Let the block find you.</em>
            </h1>

            <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-ink/65 sm:text-[16px]">
              Start a storefront or a service profile with one form. The customers are already shopping within{' '}
              <strong className="whitespace-nowrap font-semibold text-ink">1.5 km</strong> — and they pay in cash when
              the order reaches their door.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sell/apply" className={btn('noir', 'lg')}>
                Open your store
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/provider/apply" className={btn('outline', 'lg')}>
                Offer a service
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-[12.5px] font-medium text-ink/60">
                  <Icon className="h-4 w-4 text-clay" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full min-w-0 max-w-[560px] pb-6 lg:max-w-none">
            <SellerDayBoard />
          </div>
        </div>

        <div className="relative border-t border-line-warm bg-cream/70">
          <dl className={`${SHELL} grid grid-cols-3 divide-x divide-line-warm`}>
            {STATS.map(([value, label]) => (
              <div key={label} className="px-3 py-5 text-center sm:px-6 sm:py-6">
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="font-display block text-[24px] font-semibold leading-none tracking-tight text-ink sm:text-[30px]">
                    {value}
                  </span>
                  <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-ink/45 sm:text-[10.5px]">
                    {label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Two doors */}
      <section id="doors" className={`${SHELL} scroll-mt-24 py-14 sm:py-20`} aria-labelledby="doors-heading">
        <SectionHead
          id="doors-heading"
          index="01"
          eyebrow="Two ways to sell"
          title="A storefront, or a service profile."
          accent="Same block."
          lede="Pick the door that matches what you do. Each one has its own application, its own dashboard and its own kind of customer."
        />
        <div className="grid gap-5 lg:grid-cols-2">
          {DOORS.map((door, index) => (
            <DoorCard key={door.id} door={door} index={index} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line-warm bg-cream" aria-labelledby="steps-heading">
        <div className={`${SHELL} py-14 sm:py-20`}>
          <SectionHead
            id="steps-heading"
            index="02"
            eyebrow="How it works"
            title="From application to first order."
            lede="Three steps, whether you are putting a shelf online or taking bookings for the first time."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([title, text], index) => (
              <Reveal key={title} delay={index * 0.08} className="h-full">
                <div className="h-full rounded-card border border-line-warm bg-paper-warm p-6">
                  <span className="font-display block text-[44px] font-light leading-none text-clay/30">
                    0{index + 1}
                  </span>
                  <h3 className="mt-5 text-[15px] font-semibold text-ink">{title}</h3>
                  <p className={`mt-2 ${body}`}>{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-5 grid gap-3 rounded-card border border-dashed border-line-warm bg-paper-warm/60 px-5 py-4 text-[12px] leading-relaxed text-ink/55 sm:grid-cols-2 sm:gap-8">
            <p>
              <span className="font-semibold text-ink/75">Shops:</span> live as soon as you verify your email.
            </p>
            <p>
              <span className="font-semibold text-ink/75">Providers:</span> reviewed by a CityCart admin before
              customers see the profile.
            </p>
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section className={`${SHELL} py-14 sm:py-20`} aria-labelledby="dashboard-heading">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <Reveal className="min-w-0">
            <p className={eyebrow}>
              <span className="text-clay">03</span>
              <span aria-hidden="true" className="mx-2.5 inline-block h-px w-6 bg-line-warm align-middle" />
              Your counter
            </p>
            <h2 id="dashboard-heading" className={`${display.md} mt-3`}>
              Orders, stock and payouts <em className={accent}>in one place.</em>
            </h2>
            <p className={`mt-4 max-w-lg ${lede}`}>
              The dashboard is built around the work you actually do: a new order, a shelf to top up, a rider to meet,
              a bill that arrives once a month.
            </p>
            <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-sand text-clay">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-[13.5px] font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink/60">{text}</p>
                </li>
              ))}
            </ul>
            <Link to="/sell/apply" className={`${textLink} mt-8 inline-flex items-center gap-1.5 text-[12.5px]`}>
              Open your store
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal delay={0.1} className="min-w-0">
            <DashboardMock />
          </Reveal>
        </div>
      </section>

      {/* Pricing */}
      <section className={`${SHELL} pb-14 sm:pb-20`} aria-labelledby="pricing-heading">
        <div className="rounded-panel border border-line-warm bg-paper-warm p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:gap-14">
            <div>
              <p className={eyebrow}>Simple pricing</p>
              <h2 id="pricing-heading" className={`${display.md} mt-3`}>
                One percent. <em className={accent}>That’s the whole bill.</em>
              </h2>
              <p className={`mt-4 max-w-sm ${lede}`}>
                No listing fee, no monthly fee, no ad spend. You pay a share of the orders and bookings you actually
                complete.
              </p>
            </div>
            <dl className="grid gap-6 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-card bg-sand/50 px-5 py-6">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">Per sale</dt>
                <dd className="font-display mt-2 text-[34px] font-semibold leading-none tracking-tight text-ink">1%</dd>
                <dd className="mt-2 text-[11.5px] leading-relaxed text-ink/55">
                  Of each completed order or booking.
                </dd>
              </div>
              <div className="rounded-card border border-line-warm px-5 py-6">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">To list</dt>
                <dd className="font-display mt-2 text-[34px] font-semibold leading-none tracking-tight text-ink">
                  PKR 0
                </dd>
                <dd className="mt-2 text-[11.5px] leading-relaxed text-ink/55">
                  You only pay once you have sold.
                </dd>
              </div>
              <div className="rounded-card border border-line-warm px-5 py-6">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">Monthly</dt>
                <dd className="font-display mt-2 text-[34px] font-semibold leading-none tracking-tight text-ink">
                  PKR 0
                </dd>
                <dd className="mt-2 text-[11.5px] leading-relaxed text-ink/55">
                  No subscription, no ad spend.
                </dd>
              </div>
            </dl>
          </div>
          <p className="mt-8 border-t border-dashed border-line-warm pt-5 text-[11.5px] leading-relaxed text-muted">
            Bills are issued monthly and due within 7 days. Cash stays with you — CityCart never holds customer money.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${SHELL} pb-16 sm:pb-24`} aria-labelledby="faq-heading">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className={eyebrow}>Questions</p>
            <h2 id="faq-heading" className={`${display.md} mt-3`}>
              Before you apply.
            </h2>
            <p className={`mt-4 max-w-sm ${lede}`}>
              Everything you need to know before the form. If something is still unclear, ask us first — the form takes
              one sitting.
            </p>
            <Link to="/sell/apply" className={`${btn('noir', 'md')} mt-7`}>
              Open your store
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <dl className="divide-y divide-line-warm border-y border-line-warm">
            {FAQ.map(([question, answer]) => (
              <div key={question} className="py-4 sm:py-5">
                <dt className="text-[14px] font-semibold text-ink">{question}</dt>
                <dd className={`mt-2 ${body}`}>{answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Closing */}
      <section className={`${SHELL} pb-16 sm:pb-20`}>
        <Reveal>
          <div className="relative overflow-hidden rounded-panel bg-noir px-6 py-14 text-center text-cream sm:px-14 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-clay/25 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-cream/10 blur-3xl"
            />
            <div className="relative">
              <p className={eyebrowOnDark}>Sell on CityCart</p>
              <h2 className="font-display mx-auto mt-4 max-w-2xl text-[30px] font-semibold leading-[1.02] tracking-tight sm:text-[42px]">
                Your block is already shopping.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-[13.5px] leading-relaxed text-cream/60">
                One form puts your shop — or your service — in front of them.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/sell/apply" className={btn('cream', 'lg')}>
                  Open your store
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to="/provider/apply" className={btn('outlineLight', 'lg')}>
                  Offer a service
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
