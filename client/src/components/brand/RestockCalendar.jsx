import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'

/**
 * The restock calendar (docs/29 Phase 3d-2).
 *
 * Every week, average, percentage and suggested unit count below was worked out
 * on the server from this shop's own delivered orders and its own stock rows.
 * The model only writes the summary and picks which of the listed products to
 * point at; if it cannot answer, the calendar still shows.
 *
 * Nothing here buys, restocks or reserves anything. Stock still changes on the
 * inventory screen, through the ordinary save.
 */
const WINDOWS = [
  { weeks: 4, label: '4 weeks' },
  { weeks: 8, label: '8 weeks' },
  { weeks: 13, label: '13 weeks' },
]

const ATTENTION = {
  EMPTY_NOW: { words: 'Empty now', tone: 'border-clay/30 bg-clay/10 text-clay' },
  RUNS_SHORT: { words: 'Runs short', tone: 'border-clay/25 bg-clay/10 text-clay' },
  JUST_SPIKED: { words: 'Jumped last week', tone: 'border-forest/20 bg-sage/50 text-forest' },
  RUSH_BEFORE: { words: 'Rush week earlier', tone: 'border-forest/15 bg-sage/40 text-forest' },
  SELLING: { words: 'Steady', tone: 'border-line-warm bg-cream text-ink/55' },
  NOT_TRACKED: { words: 'Stock not tracked', tone: 'border-line-warm bg-cream text-ink/50' },
}

const plural = (value, word) => `${value} ${value === 1 ? word : `${word}s`}`

export default function RestockCalendar() {
  const allowed = useCan()('analytics.view')
  const [available, setAvailable] = useState(null)
  const [weeks, setWeeks] = useState(8)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!allowed) return undefined
    let active = true
    api
      .post('/ai/ping')
      .then(() => active && setAvailable(true))
      .catch((err) => active && setAvailable(err?.response?.status !== 503))
    return () => {
      active = false
    }
  }, [allowed])

  async function ask() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/ai/restock-calendar', { weeks })
      setData(res.data.data || {})
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Your weeks and stock figures are still below.'
          : getErrorMessage(err, 'The calendar could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true || !allowed) return null

  const rows = data?.products || []
  const trend = data?.trend || []
  const peak = Math.max(...trend.map((week) => week.units), 1)
  const insight = data?.insight
  // The model may only point at a product this shop was actually shown, and the
  // server already dropped anything it was not, so a note with no row under it
  // has nowhere to sit.
  const notes = new Map((insight?.watch || []).map((item) => [String(item.productId), item.note]))

  return (
    <section aria-labelledby="restock-calendar-title" className="rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI restock read
      </p>
      <h2 id="restock-calendar-title" className="mt-2 font-display text-[19px] font-semibold leading-tight text-ink">
        What sold, week by week
      </h2>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
        CityCart counts your own delivered orders by whole week and lines them up against the stock you have now, so a
        rush that caught you out before shows up while there is still time. It reads only this shop and buys nothing.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {WINDOWS.map((option) => (
          <button
            key={option.weeks}
            type="button"
            onClick={() => setWeeks(option.weeks)}
            aria-pressed={weeks === option.weeks}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              weeks === option.weeks
                ? 'border-ink/25 bg-cream text-ink'
                : 'border-line-warm bg-transparent text-ink/55 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="ml-auto inline-flex h-9 items-center rounded-tile bg-noir px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-cream transition hover:bg-noir-soft disabled:opacity-50"
        >
          {busy ? 'Reading…' : data ? 'Read it again' : 'Build the calendar'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data?.empty && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
          Nothing was delivered in those {data.window.weeks} weeks, so there is no pattern to read yet.
        </p>
      )}

      {data && !data.empty && (
        <div className="mt-5 border-t border-line-warm pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Units delivered', data.totals.units, `${plural(data.totals.deliveredOrders, 'order')} across ${plural(data.totals.sellingProducts, 'product')}`],
              [
                'Last full week',
                data.totals.lastWeekUnits,
                data.totals.shopSpikePct === null
                  ? 'No earlier week to compare against'
                  : `${data.totals.shopSpikePct > 0 ? '+' : ''}${data.totals.shopSpikePct}% against the weeks before`,
              ],
              ['Suggested units', data.totals.suggestedUnits, `To cover ${plural(data.coverHorizonWeeks, 'week')} at your own rate`],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
                <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">{value}</p>
                <p className="mt-0.5 text-[11.5px] text-ink/50">{hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
              Your weeks, oldest first
            </h3>
            <ul className="mt-3 flex items-end gap-2 sm:gap-3">
              {trend.map((week) => (
                <li key={week.index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="text-[11px] font-medium text-ink/60">{week.units}</span>
                  <span
                    className={`block w-full rounded-tile ${week.isLast ? 'bg-clay' : 'bg-sand'}`}
                    style={{ height: `${Math.max(4, Math.round((week.units / peak) * 72))}px` }}
                  />
                  <span className="w-full truncate text-center text-[10.5px] text-ink/45">{week.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-ink/45">
              The week in progress is left out, so no bar looks shorter than it was.
            </p>
          </div>

          {insight?.summary ? (
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink">{insight.summary}</p>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
              {data.degraded
                ? 'CityCart did the counting itself, but the write-up is unavailable right now. These are the figures.'
                : 'These are the figures.'}
            </p>
          )}

          {rows.length > 0 && (
            <ul className="mt-4 space-y-2">
              {rows.map((row) => (
                <li key={row.productId} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{row.productName}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                        (ATTENTION[row.attention] || { tone: 'border-line-warm text-ink/55' }).tone
                      }`}
                    >
                      {(ATTENTION[row.attention] || { words: row.attention }).words}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink/60">
                    {plural(row.units, 'unit')} over the window ({row.weeksSold} of {trend.length} weeks sold) ·{' '}
                    {row.tracked
                      ? `${plural(row.availableQuantity, 'unit')} now, ${
                          row.coverWeeks === null ? 'no selling rate to measure cover' : `${row.coverWeeks} weeks covered`
                        }`
                      : 'stock is not tracked'}
                    {row.suggestedUnits > 0 ? ` · suggested ${plural(row.suggestedUnits, 'unit')} more` : ''}
                  </p>
                  {notes.get(row.productId) && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-forest">{notes.get(row.productId)}</p>
                  )}
                  <Link
                    to={`/brand/inventory?search=${encodeURIComponent(row.productName)}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-forest transition hover:underline"
                  >
                    Change stock
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {insight?.actions?.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Checks you can do yourself</h3>
              <ul className="mt-2.5 space-y-1.5">
                {insight.actions.map((action) => (
                  <li key={action} className="flex gap-2 text-[12.5px] leading-relaxed text-ink/70">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-clay" aria-hidden="true" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.productCount > rows.length && (
            <p className="mt-3 text-[11.5px] text-ink/45">
              {plural(data.productCount, 'product')} sold in the window; the {rows.length} above are the ones that need
              reading first{data.totals.capped ? ' of a larger catalogue that had to be cut short' : ''}.
            </p>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink/45">
            Suggested units cover {plural(data.coverHorizonWeeks, 'week')} at your own selling rate. CityCart does not
            know how long your supplier takes, so that part stays yours to judge — and nothing here is ordered for you.
          </p>
        </div>
      )}
    </section>
  )
}
