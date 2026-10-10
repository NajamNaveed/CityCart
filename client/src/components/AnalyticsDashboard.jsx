import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { PageHeader } from './brand/Bits'

export function DateFilter({ onApply }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onApply({ from, to })
      }}
      className="mb-7 flex flex-wrap items-end gap-3 border-b border-line pb-5"
    >
      <div>
        <label htmlFor="analytics-from" className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-muted">From</label>
        <input id="analytics-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-md border border-line bg-white px-3 text-[12px] text-ink outline-none focus:border-ink" />
      </div>
      <div>
        <label htmlFor="analytics-to" className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-muted">To</label>
        <input id="analytics-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-md border border-line bg-white px-3 text-[12px] text-ink outline-none focus:border-ink" />
      </div>
      <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-[12px] font-medium text-white transition hover:bg-ink-soft">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Apply range
      </button>
      <p className="ml-auto pb-2 text-xs text-muted">Showing {from || 'last 30 days'}{to ? ` to ${to}` : ''}</p>
    </form>
  )
}

export function MetricGrid({ metrics }) {
  return (
    <dl className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, note }) => (
        <div key={label} className="border-t border-line py-4">
          <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{label}</dt>
          <dd className="font-display mt-1.5 text-2xl font-semibold text-ink">{value}</dd>
          {note && <p className="mt-1 text-xs text-muted">{note}</p>}
        </div>
      ))}
    </dl>
  )
}

export function TrendChart({ title, items, series, dateKey = 'date' }) {
  const max = Math.max(1, ...items.flatMap((item) => series.map(({ key }) => Number(item[key]) || 0)))
  return (
    <section className="min-w-0 border-t border-line pt-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {series.map(({ key, label, color }) => (
            <span key={key} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`h-2 w-2 rounded-sm ${color}`} aria-hidden="true" />{label}
            </span>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No activity in this date range.</p>
      ) : (
        <div role="img" aria-label={title} className="flex h-48 items-end gap-1 border-b border-line px-1 sm:gap-1.5">
          {items.map((item, index) => (
            <div key={item[dateKey]} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${item[dateKey]}: ${series.map(({ key, label, format }) => `${label} ${format ? format(item[key]) : item[key]}`).join(', ')}`}>
              <div className="flex h-full items-end justify-center gap-px sm:gap-0.5">
                {series.map(({ key, color }) => (
                  <span key={key} className={`min-h-px w-full max-w-3 ${color} rounded-t-[2px]`} style={{ height: `${Math.max(1, (Number(item[key]) || 0) / max * 100)}%` }} />
                ))}
              </div>
              {(index === 0 || index === items.length - 1 || (items.length > 8 && index % Math.ceil(items.length / 6) === 0)) && (
                <span className="mt-2 truncate text-center text-[9px] text-muted">{String(item[dateKey]).slice(5)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function StatusList({ title, items }) {
  const max = Math.max(1, ...items.map((item) => item.count))
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {items.length === 0 ? <p className="py-4 text-sm text-muted">No records in this date range.</p> : (
        <ul className="space-y-3">
          {items.map(({ status, count }) => (
            <li key={status}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="text-ink">{String(status).toLowerCase().replaceAll('_', ' ')}</span>
                <span className="tabular-nums text-muted">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper"><span className="block h-full rounded-full bg-pine" style={{ width: `${count / max * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AnalyticsPage({ title, intro, appliedRange, onApply, loading, error, children }) {
  return (
    <>
      <PageHeader title={title} intro={intro} />
      <DateFilter onApply={onApply} />
      {error ? <p role="alert" className="border-l-2 border-clay px-3 py-2 text-sm text-clay">{error}</p> : null}
      {loading ? <p className="py-16 text-center text-sm text-muted">Loading analytics…</p> : children}
      <span className="sr-only">Date range applied: {appliedRange?.from || 'last 30 days'} to {appliedRange?.to || 'today'}</span>
    </>
  )
}
