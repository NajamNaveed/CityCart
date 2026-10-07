import { ChevronLeft, ChevronRight } from 'lucide-react'
import { humanize } from '../../ui'

// Status colours across the dashboard: done/good = green, in progress/needs
// attention = amber, problems = red, everything else stays quiet.
const STATUS_TONE = {
  ACTIVE: 'good', DELIVERED: 'good', CONFIRMED: 'good', PAID: 'good', IN_STOCK: 'good',
  READY_FOR_SHIPMENT: 'good', PROCESSING: 'info',
  PENDING: 'warn', LOW_STOCK: 'warn', OUT_OF_STOCK: 'bad', SHIPPED: 'info',
  OUT_FOR_DELIVERY: 'info', IN_TRANSIT: 'info', PICKED_UP: 'info', READY_FOR_PICKUP: 'info',
  REJECTED: 'bad', CANCELLED: 'bad', FAILED: 'bad', RETURNED: 'bad',
  REFUNDED: 'bad', PARTIALLY_REFUNDED: 'warn',
  SUSPENDED: 'warn', TERMINATED: 'bad', DRAFT: 'quiet', INACTIVE: 'quiet', ARCHIVED: 'quiet',
}

const TONES = {
  good: 'border-success/25 bg-success-soft text-success',
  info: 'border-info/25 bg-info-soft text-info',
  warn: 'border-warning/30 bg-warning-soft text-warning',
  bad: 'border-danger/25 bg-danger-soft text-danger',
  quiet: 'border-line bg-paper text-muted',
}

export function StatusBadge({ value }) {
  const tone = TONES[STATUS_TONE[value] || 'quiet']
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] ${tone}`}
    >
      {humanize(value)}
    </span>
  )
}

export function PageHeader({ title, intro, action }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {intro && <p className="mt-1.5 text-[13.5px] text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  )
}

export function Notice({ children, tone = 'ok' }) {
  if (!children) return null
  return (
    <p
      role="status"
      className={`mb-6 rounded-md px-3.5 py-2.5 text-sm ${
        tone === 'ok' ? 'bg-success-soft text-success' : 'bg-clay/5 text-clay'
      }`}
    >
      {children}
    </p>
  )
}

export function Pager({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null
  return (
    <div className="mt-7 flex items-center justify-between text-sm">
      <button
        type="button"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3.5 font-medium text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Previous
      </button>
      <span className="text-muted">
        Page {pagination.page} of {pagination.pages}
      </span>
      <button
        type="button"
        disabled={pagination.page >= pagination.pages}
        onClick={() => onPage(pagination.page + 1)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3.5 font-medium text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

// Shared table styling: a white card with quiet header row.
export const tableShell = 'overflow-x-auto rounded-lg border border-line bg-white'
export const tableHead = 'border-b border-line bg-paper/60 text-[11px] font-medium uppercase tracking-[0.12em] text-muted'
export const tableRow = 'border-b border-line last:border-b-0 transition-colors hover:bg-paper/60'
export const selectClass =
  'h-10 rounded-md border border-line bg-white px-3 text-[13px] text-ink outline-none transition focus:border-ink'
