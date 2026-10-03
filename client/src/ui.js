// Shared class strings so buttons look identical everywhere.
const base =
  'inline-flex h-11 items-center justify-center rounded-sm px-6 text-[13px] font-medium uppercase tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-50'

export const btnPrimary = `${base} bg-clay text-cream hover:bg-clay-dark`
export const btnDark = `${base} bg-ink text-cream hover:bg-black`
export const btnOutline = `${base} border border-ink text-ink hover:bg-ink hover:text-cream`

export const sectionLabel = 'text-[11px] font-medium uppercase tracking-[0.18em] text-muted'

const money = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
export const formatPrice = (value) => money.format(value ?? 0)

export const wrap = 'mx-auto w-full max-w-7xl px-5'


// Seller side uses the pine green; the shop keeps clay.
export const btnPine =
  'inline-flex h-11 items-center justify-center rounded-sm bg-pine px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-cream transition hover:bg-[#162b22] disabled:cursor-not-allowed disabled:opacity-50'
export const btnCream =
  'inline-flex h-11 items-center justify-center rounded-sm bg-cream px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-pine transition hover:bg-white'
export const btnCreamOutline =
  'inline-flex h-11 items-center justify-center rounded-sm border border-cream/60 px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-cream transition hover:bg-cream hover:text-pine'

export const inputClass =
  'w-full rounded-sm border border-line bg-paper px-3.5 text-sm text-ink placeholder-muted/60 outline-none transition focus:border-ink'


const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '')

// "READY_FOR_SHIPMENT" -> "Ready for shipment"
export const humanize = (value = '') => {
  const text = value.toLowerCase().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}