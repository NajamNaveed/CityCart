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