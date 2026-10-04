import { humanize } from '../../ui'

const TONES = {
  good: 'border-pine/40 bg-pine/10 text-pine',
  warn: 'border-clay/40 bg-clay/10 text-clay',
  quiet: 'border-line bg-sand text-muted',
}

const STATUS_TONE = {
  ACTIVE: 'good', DELIVERED: 'good', CONFIRMED: 'good', PAID: 'good', IN_STOCK: 'good',
  PENDING: 'warn', LOW_STOCK: 'warn', OUT_OF_STOCK: 'warn', REJECTED: 'warn', CANCELLED: 'warn', FAILED: 'warn',
  SUSPENDED: 'warn', TERMINATED: 'warn',
}

export function StatusBadge({ value }) {
  const tone = TONES[STATUS_TONE[value] || 'quiet']
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${tone}`}>
      {humanize(value)}
    </span>
  )
}

export function PageHeader({ title, intro, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {intro && <p className="mt-1.5 text-sm text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  )
}

export function Notice({ children, tone = 'ok' }) {
  if (!children) return null
  return (
    <p role="status" className={`mb-6 border-l-2 px-3 py-2 text-sm ${tone === 'ok' ? 'border-pine bg-pine/10' : 'border-clay bg-sand'}`}>
      {children}
    </p>
  )
}

export function Pager({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null
  return (
    <div className="mt-8 flex items-center justify-between text-sm">
      <button type="button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="font-medium text-pine disabled:text-muted">
        Previous
      </button>
      <span className="text-muted">
        Page {pagination.page} of {pagination.pages}
      </span>
      <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} className="font-medium text-pine disabled:text-muted">
        Next
      </button>
    </div>
  )
}

export const selectClass = 'h-10 rounded-sm border border-line bg-paper px-3 text-[13px] outline-none focus:border-ink'