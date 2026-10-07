import { Check } from 'lucide-react'

const DEFAULT_POINTS = [
  'Cash on delivery on every order',
  'One cart for several brands',
  'Local brands, organised by city',
]

// Two-column frame shared by the sign-in and register pages.
// tone="pine" is the seller-side variant; the customer panel is deep ink.
export default function AuthShell({ eyebrow, title, intro, points = DEFAULT_POINTS, tone = 'sand', children }) {
  const pine = tone === 'pine'
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl lg:grid-cols-[1.15fr_1fr]">
      <div
        className={`hidden px-12 py-16 lg:flex lg:flex-col lg:justify-between ${pine ? 'bg-pine text-white' : 'bg-ink text-white'}`}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/50">{eyebrow}</p>
        <div className="py-16">
          <p className="font-display max-w-md text-[40px] font-semibold leading-[1.1] tracking-tight">{title}</p>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/65">{intro}</p>
        </div>
        <ul className="space-y-3 text-[13.5px] text-white/75">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2.5">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${pine ? 'bg-white/15' : 'bg-white/10'}`}>
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-center bg-white px-5 py-14 sm:py-20">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
