// Shared class strings so buttons, inputs and cards look identical everywhere.
// Pages consume these directly; components/ wraps them where behaviour repeats.

const base =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md px-6 text-[13px] font-medium uppercase tracking-[0.08em] transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

export const btnPrimary = `${base} bg-clay text-white shadow-sm shadow-clay/25 hover:bg-clay-dark`
export const btnDark = `${base} bg-ink text-white hover:bg-ink-soft`
export const btnOutline = `${base} border border-ink bg-transparent text-ink hover:bg-ink hover:text-white`
export const btnGhost =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-medium text-ink transition hover:bg-ink/5'

// Seller side uses the pine green; the shop keeps clay.
export const btnPine =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md bg-pine px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-white transition-all duration-200 hover:bg-pine-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
export const btnCream =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md bg-cream px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-pine transition-colors hover:bg-white'
export const btnCreamOutline =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/25 px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-white transition-colors hover:border-white/60'

export const sectionLabel = 'text-[11px] font-medium uppercase tracking-[0.18em] text-muted'

export const inputClass =
  'w-full rounded-md border border-line bg-white px-3.5 text-sm text-ink placeholder-muted/50 outline-none transition-[border-color,box-shadow] focus:border-ink focus:ring-2 focus:ring-ink/10'

// Cards: white sheets lifted off the paper background.
export const card = 'rounded-lg border border-line bg-surface'
export const cardHover = 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5'

export const skeleton = 'animate-pulse rounded-md bg-line/60'

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
