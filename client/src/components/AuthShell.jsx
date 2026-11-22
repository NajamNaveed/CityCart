import { Check } from 'lucide-react'
import { eyebrowOnDark } from '../design'

const DEFAULT_POINTS = [
  'Cash on delivery on every order',
  'One cart for several brands',
  'Local brands, organised by city',
]

// Inset two-column frame shared by the sign-in and register pages. The seller
// doors pass tone="pine" for a forest panel; customer pages use deep ink.
export default function AuthShell({ eyebrow, title, intro, points = DEFAULT_POINTS, tone = 'sand', children }) {
  const seller = tone === 'pine'
  return (
    <div className="relative overflow-hidden bg-canvas">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-[-160px] h-[420px] w-[420px] rounded-full bg-gold-soft/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-[-180px] h-[460px] w-[460px] rounded-full bg-glow-rose/20 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-[1200px] px-5 py-8 sm:py-12">
        <div className="relative overflow-hidden rounded-[28px] border border-line-warm bg-paper-warm shadow-[0_40px_90px_-48px_rgba(21,20,15,0.45)] lg:grid lg:grid-cols-[1.05fr_1fr]">
          <div
            className={`relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14 ${
              seller ? 'bg-forest-deep' : 'bg-noir'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${
                seller ? 'from-transparent via-sage/60 to-transparent' : 'from-transparent via-gold/70 to-transparent'
              }`}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl ${
                seller ? 'bg-sage/12' : 'bg-clay/20'
              }`}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-cream/5 blur-3xl"
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full border ${
                seller ? 'border-sage/15' : 'border-cream/10'
              }`}
            />

            <p className={`relative ${eyebrowOnDark}`}>{eyebrow}</p>
            <div className="relative py-12">
              <p className="font-display max-w-md text-[36px] font-semibold leading-[1.02] tracking-[-0.03em] text-cream xl:text-[44px]">
                {title}
              </p>
              <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-cream/60">{intro}</p>
            </div>
            <ul className="relative space-y-3 text-[13px] text-cream/75">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cream/10 text-cream ring-1 ring-cream/15">
                    <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center justify-center px-5 py-12 sm:px-10 sm:py-16">
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r lg:hidden ${
                seller ? 'from-transparent via-forest/30 to-transparent' : 'from-transparent via-clay/30 to-transparent'
              }`}
            />
            <div className="w-full max-w-sm">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
