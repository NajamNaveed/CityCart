// Shared class strings so buttons, inputs and cards look identical everywhere.
// Pages consume these directly; components/ wraps them where behaviour repeats.

const base =
  'inline-flex h-11 items-center justify-center gap-2 rounded-tile px-6 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50'

export const btnPrimary = `${base} bg-clay text-white hover:bg-clay-dark`
export const btnDark = `${base} bg-noir text-cream hover:bg-noir-soft`
export const btnOutline = `${base} border border-ink/15 bg-transparent text-ink hover:border-ink/40 hover:bg-ink/5`
export const btnGhost =
  'inline-flex h-11 items-center justify-center gap-2 rounded-tile px-4 text-[13px] font-medium text-ink/70 transition hover:bg-ink/5 hover:text-ink'

// Seller side uses the deep forest; the shop keeps clay.
export const btnPine =
  'inline-flex h-11 items-center justify-center gap-2 rounded-tile bg-forest px-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-cream transition-colors duration-200 hover:bg-forest-deep disabled:pointer-events-none disabled:opacity-50'
export const btnCream =
  'inline-flex h-11 items-center justify-center gap-2 rounded-tile bg-cream px-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-noir transition-colors hover:bg-white'
export const btnCreamOutline =
  'inline-flex h-11 items-center justify-center gap-2 rounded-tile border border-white/25 px-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-white/60'

export const sectionLabel = 'text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink/45'

export const inputClass =
  'w-full rounded-tile border border-line-warm bg-paper-warm px-3.5 text-sm text-ink placeholder:text-muted/60 outline-none transition-[border-color,box-shadow] focus:border-ink/40 focus:ring-2 focus:ring-ink/10'

// Cards: warm paper sheets lifted off the canvas.
export const card = 'rounded-card border border-line-warm bg-paper-warm'
export const cardHover = 'transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(21,20,15,0.07)]'

export const skeleton = 'animate-pulse rounded-tile bg-line-warm/60'

const money = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
export const formatPrice = (value) => money.format(value ?? 0)

export const wrap = 'mx-auto w-full max-w-7xl px-5'

const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '')

// "READY_FOR_SHIPMENT" -> "Ready for shipment"
export const humanize = (value = '') => {
  const text = value.toLowerCase().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const dateOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const formatDate = (value) => (value ? dateOnly.format(new Date(value)) : '')
