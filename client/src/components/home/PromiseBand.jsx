import { Link } from 'react-router-dom'
import { ArrowRight, HandCoins, MapPin, ShieldCheck } from 'lucide-react'
import { btn, panelDark } from '../../design'

const PROMISES = [
  {
    icon: MapPin,
    title: '1.5 km, measured from your block',
    text: 'If it is further out, it is not on the list. Delivery stays close enough to stay fresh.',
  },
  {
    icon: HandCoins,
    title: 'Pay when it arrives',
    text: 'Cash to the rider at your door. No card details, no wallet top-ups, no advance payment.',
  },
  {
    icon: ShieldCheck,
    title: 'Every seller is checked',
    text: 'Shops and pros are reviewed before they appear on your street — and rated by neighbours after.',
  },
]

export default function PromiseBand() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-5 pb-14 pt-14 sm:pt-20" aria-labelledby="promise-title">
      <div className={`relative overflow-hidden ${panelDark} px-6 py-12 sm:px-10 lg:px-14 lg:py-16`}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-clay/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-cream/10 blur-3xl"
        />

        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cream/45">The CityCart promise</p>
            <h2
              id="promise-title"
              className="font-display mt-4 text-[36px] font-semibold leading-[0.98] tracking-[-0.03em] sm:text-[48px]"
            >
              Cash at the door.
              <br />
              <em className="font-normal italic text-clay">Always.</em>
            </h2>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-cream/55">
              CityCart is built around the street you live on, not a warehouse across the city. A short list, real
              neighbours, and a payment that happens when the bag is in your hands.
            </p>
            <Link
              to="/nearby"
              className={`mt-7 ${btn('cream')}`}
            >
              Shop your block
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ul className="grid gap-7 sm:gap-8">
            {PROMISES.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex gap-4 border-t border-cream/10 pt-6 first:border-t-0 first:pt-0 sm:first:border-t sm:first:pt-6">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-tile border border-cream/15 bg-cream/5 text-clay">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="flex items-baseline gap-2 text-[15px] font-medium text-cream">
                    <span className="text-[10px] font-semibold tabular-nums text-cream/35">0{index + 1}</span>
                    {title}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-cream/50">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
