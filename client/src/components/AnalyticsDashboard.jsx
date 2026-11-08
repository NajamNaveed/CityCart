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
      className="mb-7 flex flex-wrap items-end gap-3 border-b border-line-warm pb-5"
    >
      <div>
        <label htmlFor="analytics-from" className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-ink/55">From</label>
        <input id="analytics-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-tile border border-line-warm bg-paper-warm px-3 text-[12px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10" />
      </div>
      <div>
        <label htmlFor="analytics-to" className="mb-1 block text-[10px] font-medium uppercase tracking-[0.1em] text-ink/55">To</label>
        <input id="analytics-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-tile border border-line-warm bg-paper-warm px-3 text-[12px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10" />
      </div>
      <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-tile bg-noir px-4 text-[12px] font-medium text-cream transition hover:bg-noir-soft">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Apply range
      </button>
      <p className="ml-auto pb-2 text-xs text-ink/55">Showing {from || 'last 30 days'}{to ? ` to ${to}` : ''}</p>
    </form>
  )
}

export function MetricGrid({ metrics }) {
  return (
    <dl className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, note }) => (
        <div key={label} className="border-t border-line-warm py-4">
          <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink/55">{label}</dt>
          <dd className="font-display mt-1.5 text-2xl font-semibold text-ink">{value}</dd>
          {note && <p className="mt-1 text-xs text-ink/55">{note}</p>}
        </div>
      ))}
    </dl>
  )
}

export function TrendChart({ title, items, series, dateKey = 'date' }) {
  const max = Math.max(1, ...items.flatMap((item) => series.map(({ key }) => Number(item[key]) || 0)))
  return (
    <section className="min-w-0 border-t border-line-warm pt-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {series.map(({ key, label, color }) => (
            <span key={key} className="flex items-center gap-1.5 text-[11px] text-ink/55">
              <span className={`h-2 w-2 rounded-sm ${color}`} aria-hidden="true" />{label}
            </span>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink/55">No activity in this date range.</p>
      ) : (
        <div role="img" aria-label={title} className="flex h-48 items-end gap-1 border-b border-line-warm px-1 sm:gap-1.5">
          {items.map((item, index) => (
            <div key={item[dateKey]} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${item[dateKey]}: ${series.map(({ key, label, format }) => `${label} ${format ? format(item[key]) : item[key]}`).join(', ')}`}>
              <div className="flex h-full items-end justify-center gap-px sm:gap-0.5">
                {series.map(({ key, color }) => (
                  <span key={key} className={`min-h-px w-full max-w-3 ${color} rounded-t-[2px]`} style={{ height: `${Math.max(1, (Number(item[key]) || 0) / max * 100)}%` }} />
                ))}
              </div>
              {(index === 0 || index === items.length - 1 || (items.length > 8 && index % Math.ceil(items.length / 6) === 0)) && (
                <span className="mt-2 truncate text-center text-[9px] text-ink/55">{String(item[dateKey]).slice(5)}</span>
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
    <section className="border-t border-line-warm pt-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {items.length === 0 ? <p className="py-4 text-sm text-ink/55">No records in this date range.</p> : (
        <ul className="space-y-3">
          {items.map(({ status, count }) => (
            <li key={status}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="text-ink">{String(status).toLowerCase().replaceAll('_', ' ')}</span>
                <span className="tabular-nums text-ink/55">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand/50"><span className="block h-full rounded-full bg-forest" style={{ width: `${count / max * 100}%` }} /></div>
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
      {error ? <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{error}</p> : null}
      {loading ? <p className="py-16 text-center text-sm text-ink/55">Loading analytics…</p> : children}
      <span className="sr-only">Date range applied: {appliedRange?.from || 'last 30 days'} to {appliedRange?.to || 'today'}</span>
    </>
  )
}
