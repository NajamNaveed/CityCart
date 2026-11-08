import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { humanize } from '../../ui'
import { Button } from '../../design'

// Status colours across every dashboard: success is forest/sage, attention is
// warm amber, failures are clay, everything else stays quiet.
const STATUS_TONE = {
  ACTIVE: 'good', DELIVERED: 'good', CONFIRMED: 'good', PAID: 'good', IN_STOCK: 'good',
  VERIFIED: 'good', READY_FOR_SHIPMENT: 'good', RECEIVED: 'good', ACCEPTED: 'good',
  COMPLETED: 'good', APPROVED: 'good',
  PROCESSING: 'info', SHIPPED: 'info', OUT_FOR_DELIVERY: 'info', IN_TRANSIT: 'info',
  PICKED_UP: 'info', READY_FOR_PICKUP: 'info', REQUESTED: 'info', IN_PROGRESS: 'info',
  ISSUED: 'info', SUBMITTED: 'info', ACCRUED: 'info', INVOICED: 'info',
  PENDING: 'warn', LOW_STOCK: 'warn', UNVERIFIED: 'warn', PROPOSED: 'warn', REMOVED: 'warn',
  WARNING: 'warn', PARTIALLY_PAID: 'warn', PARTIALLY_REFUNDED: 'warn', RETURN_REQUESTED: 'warn',
  RETURNED: 'warn', REFUNDED: 'warn', SUSPENDED: 'warn',
  OUT_OF_STOCK: 'bad', DECLINED: 'bad', DISPUTED: 'bad', REJECTED: 'bad', CANCELLED: 'bad',
  FAILED: 'bad', TERMINATED: 'bad', OVERDUE: 'bad', RESTRICTED: 'bad', FROZEN: 'bad',
  ORDER_CANCELLED: 'bad',
  WITHDRAWN: 'quiet', EXPIRED: 'quiet', DRAFT: 'quiet', INACTIVE: 'quiet', ARCHIVED: 'quiet',
  VOID: 'quiet', REVERSED: 'quiet',
}

const TONES = {
  good: 'border-forest/20 bg-sage text-forest',
  info: 'border-[#c8d6e5] bg-[#eaf1f8] text-[#1f4b7a]',
  warn: 'border-[#e5d2a9] bg-[#f8efd9] text-[#855811]',
  bad: 'border-clay/25 bg-clay/10 text-clay',
  quiet: 'border-line-warm bg-sand text-ink/55',
}

export function StatusBadge({ value }) {
  const tone = TONES[STATUS_TONE[value] || 'quiet']
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${tone}`}
    >
      {humanize(value)}
    </span>
  )
}

export function PageHeader({ title, intro, action, eyebrow }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line-warm pb-6">
      <div className="max-w-2xl">
        {eyebrow && <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">{eyebrow}</p>}
        <h1 className={`font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px] ${eyebrow ? 'mt-2' : ''}`}>
          {title}
        </h1>
        {intro && <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink/60">{intro}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2.5">{action}</div>}
    </header>
  )
}

export function SectionTitle({ title, hint, action, className = '' }) {
  return (
    <div className={`mb-4 flex flex-wrap items-end justify-between gap-3 ${className}`.trim()}>
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-ink/55">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

export function Notice({ children, tone = 'ok' }) {
  if (!children) return null
  const styles =
    tone === 'ok'
      ? 'border-forest/20 bg-sage/80 text-forest'
      : tone === 'info'
        ? 'border-line-warm bg-cream/80 text-ink/70'
        : 'border-clay/25 bg-clay/10 text-clay'
  return (
    <p role={tone === 'ok' ? 'status' : 'alert'} className={`mb-6 rounded-tile border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </p>
  )
}

export function ErrorNotice({ children, onRetry }) {
  if (!children) return null
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-clay/25 bg-clay/10 px-4 py-3.5 text-sm text-clay">
      <p>{children}</p>
      {onRetry && (
        <Button tone="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, hint, to, tone = 'quiet' }) {
  const iconTone =
    tone === 'bad'
      ? 'bg-clay/10 text-clay'
      : tone === 'warn'
        ? 'bg-[#f8efd9] text-[#855811]'
        : tone === 'good'
          ? 'bg-sage text-forest'
          : 'bg-sand text-ink/60'
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-tile ${iconTone}`}>
            <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
          </span>
        )}
        {to && <ChevronRight className="mt-1 h-4 w-4 text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-ink/50" aria-hidden="true" />}
      </div>
      <p className="mt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/45">{label}</p>
      <p className="font-display mt-1 text-[30px] font-semibold leading-none tracking-tight text-ink">{value ?? '—'}</p>
      {hint && <p className="mt-2 text-[12px] leading-relaxed text-ink/55">{hint}</p>}
    </>
  )

  const className =
    'group block rounded-card border border-line-warm bg-paper-warm p-4 transition duration-300 sm:p-5' +
    (to ? ' hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(21,20,15,0.07)]' : '')

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    )
  }
  return <div className={className}>{content}</div>
}

export function Pager({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null

  const button = (disabled) =>
    `inline-flex h-9 items-center gap-1.5 rounded-tile border px-3.5 text-[12px] font-medium transition ${
      disabled
        ? 'cursor-not-allowed border-line-warm bg-paper-warm text-ink/30'
        : 'border-line-warm bg-paper-warm text-ink hover:border-ink/30 hover:bg-cream/70'
    }`

  return (
    <nav aria-label="Pagination" className="mt-7 flex items-center justify-between gap-3 text-sm">
      <button type="button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className={button(pagination.page <= 1)} aria-label="Previous page">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Previous
      </button>
      <span className="text-[12.5px] text-ink/55" aria-live="polite">
        Page {pagination.page} of {pagination.pages}
      </span>
      <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} className={button(pagination.page >= pagination.pages)} aria-label="Next page">
        Next
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </nav>
  )
}

// Shared table styling: a warm card with a quiet header row.
export const tableShell = 'w-full overflow-x-auto rounded-card border border-line-warm bg-paper-warm'
export const tableHead = 'border-b border-line-warm bg-sand/55 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45'
export const tableRow = 'border-b border-line-warm last:border-b-0 transition-colors hover:bg-cream/40'
export const selectClass =
  'h-10 rounded-tile border border-line-warm bg-paper-warm px-3 text-[13px] text-ink outline-none transition focus:border-ink/40 focus:ring-2 focus:ring-ink/10'
// Tab rows scroll on narrow screens so no tab is clipped or orphaned on a second line.
export const tabRow = 'mb-6 flex gap-1 overflow-x-auto border-b border-line-warm'
export const tabButton =
  'shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-[12.5px] font-medium transition-colors sm:px-4 sm:text-[13px]'

export function TableScroll({ label, children, className = '' }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={`${tableShell} ${className}`.trim()}>
      {children}
    </div>
  )
}
