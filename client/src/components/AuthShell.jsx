// Two-column frame shared by the customer sign-in and register pages.
export default function AuthShell({ eyebrow, title, intro, children }) {
  return (
    <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
      <div className="hidden bg-sand px-12 py-20 lg:flex lg:flex-col lg:justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <div>
          <p className="max-w-md text-4xl font-semibold leading-[1.15] tracking-tight">{title}</p>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">{intro}</p>
        </div>
        <ul className="space-y-1 text-sm text-muted">
          <li>Cash on delivery on every order</li>
          <li>One cart for several brands</li>
          <li>Local brands, organised by city</li>
        </ul>
      </div>
      <div className="flex items-center justify-center px-5 py-14 sm:py-20">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}