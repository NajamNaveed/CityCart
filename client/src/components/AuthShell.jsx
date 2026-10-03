const DEFAULT_POINTS = [
  'Cash on delivery on every order',
  'One cart for several brands',
  'Local brands, organised by city',
]

// Two-column frame shared by the sign-in and register pages.
// tone="pine" is the seller-side variant.
export default function AuthShell({ eyebrow, title, intro, points = DEFAULT_POINTS, tone = 'sand', children }) {
  const pine = tone === 'pine'
  return (
    <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
      <div
        className={`hidden px-12 py-20 lg:flex lg:flex-col lg:justify-between ${
          pine ? 'bg-pine text-cream' : 'bg-sand'
        }`}
      >
        <p className={`text-[11px] font-medium uppercase tracking-[0.18em] ${pine ? 'text-cream/60' : 'text-muted'}`}>
          {eyebrow}
        </p>
        <div>
          <p className="max-w-md text-4xl font-semibold leading-[1.15] tracking-tight">{title}</p>
          <p className={`mt-5 max-w-sm text-[15px] leading-relaxed ${pine ? 'text-cream/75' : 'text-muted'}`}>{intro}</p>
        </div>
        <ul className={`space-y-1 text-sm ${pine ? 'text-cream/75' : 'text-muted'}`}>
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-center px-5 py-14 sm:py-20">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}