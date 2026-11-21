import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'
import { formatPrice } from '../../ui'

/**
 * The weekly shop report (docs/29 Phase 3d-4).
 *
 * Every count, rupee and percentage below was worked out on the server from the
 * same dashboard call that fills the charts above this card, so the paragraph
 * and the tiles cannot disagree. The model only re-words what CityCart measured;
 * when it cannot answer, the week is still printed in full.
 *
 * Nothing is saved, mailed or scheduled. The shop asks, reads, and closes the
 * page.
 */
const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
]

const MOVEMENT_TONE = {
  UP: 'border-forest/20 bg-sage/50 text-forest',
  NEW: 'border-forest/20 bg-sage/40 text-forest',
  DOWN: 'border-clay/30 bg-clay/10 text-clay',
  FLAT: 'border-line-warm bg-cream text-ink/55',
}

const ALERT_TONE = {
  OUT_OF_STOCK: 'border-clay/30 bg-clay/10 text-clay',
  LOW_STOCK: 'border-sand bg-cream text-ink/60',
}

const plural = (value, word) => `${value} ${value === 1 ? word : `${word}s`}`
const signed = (value) => (value === null || value === undefined ? null : `${value > 0 ? '+' : ''}${value}`)

const day = (key) => {
  if (!key) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${key}T00:00:00`))
}

/**
 * One like-for-like row. A null percentage means the other window had nothing to
 * divide by, and the panel says so instead of printing 0%.
 */
function Compare({ label, pair, money }) {
  if (!pair) return null
  const show = (value) => (money ? formatPrice(value) : plural(value, 'order'))
  return (
    <div className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">{show(pair.current)}</p>
      <p className="mt-0.5 text-[11.5px] text-ink/50">
        {show(pair.previous)} the week before
        {pair.pct === null || pair.pct === undefined ? ' · no baseline to measure against' : ` · ${signed(pair.pct)}%`}
      </p>
    </div>
  )
}

export default function ShopReport() {
  const allowed = useCan()('analytics.view')
  const [available, setAvailable] = useState(null)
  const [days, setDays] = useState(7)
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
      const res = await api.post('/ai/shop-report', { days })
      setData(res.data.data || {})
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Nothing was counted, so try again tomorrow.'
          : getErrorMessage(err, 'The week could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true || !allowed) return null

  const insight = data?.insight
  const rows = data?.products || []
  const notes = new Map((insight?.notes || []).map((item) => [String(item.productId), item.note]))

  return (
    <section aria-labelledby="shop-report-title" className="rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI week read
      </p>
      <h2 id="shop-report-title" className="mt-2 font-display text-[19px] font-semibold leading-tight text-ink">
        Your week, against the week before
      </h2>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
        CityCart reads the same numbers your dashboard charts already show, lines the two weeks up day against day, and
        writes one paragraph about what moved. It reads only this shop, and it never prices anything for you.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {WINDOWS.map((option) => (
          <button
            key={option.days}
            type="button"
            onClick={() => setDays(option.days)}
            aria-pressed={days === option.days}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              days === option.days
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
          {busy ? 'Reading…' : data ? 'Read it again' : 'Read my week'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data?.empty && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
          No order was placed here in the {data.window.days} days from {day(data.window.from)} to {day(data.window.to)}, so
          there is nothing to compare yet. This costs you no AI request.
        </p>
      )}

      {data && !data.empty && (
        <div className="mt-5 border-t border-line-warm pt-4">
          <p className="text-[11.5px] leading-relaxed text-ink/50">
            {day(data.window.from)}–{day(data.window.to)} measured against {day(data.window.compare.from)}–
            {day(data.window.compare.to)}.
            {data.aligned.days
              ? ` The like-for-like columns below cover ${plural(data.aligned.days, 'day')} up to ${day(data.aligned.through)}; ${day(
                  data.window.partialLastDay,
                )} is still running and is left out of both weeks.`
              : ' There is no finished day to compare yet.'}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Compare label="Delivered orders" pair={data.aligned.deliveredOrders} />
            <Compare label="Revenue" pair={data.aligned.revenue} money />
            <Compare label="Average delivered order" pair={data.aligned.averageOrderValue} money />
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

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                'Orders placed',
                plural(data.totals.orders, 'order'),
                `${plural(data.totals.deliveredOrders, 'delivered')}, ${plural(data.cancellation.orders, 'cancelled or rejected')} (${
                  data.cancellation.pct === null ? 'no orders to divide by' : `${data.cancellation.pct}%`
                }), ${plural(data.totals.pendingOrders, 'still pending')}`,
              ],
              ['Revenue', formatPrice(data.totals.revenue), `Last week ${formatPrice(data.previousTotals.revenue)}`],
              [
                'Units and customers',
                plural(data.totals.units, 'unit'),
                `${plural(data.totals.customers, 'customer')} (${plural(data.totals.repeatCustomers, 'repeat')}) against ${plural(
                  data.previousTotals.customers,
                  'customer',
                )} last week`,
              ],
              [
                'Busiest day',
                data.bestDay ? day(data.bestDay.date) : 'None yet',
                data.bestDay
                  ? `${plural(data.bestDay.orders, 'order')} worth ${formatPrice(data.bestDay.revenue)}${
                      data.bestDay.isToday ? ' (that day is still running)' : ''
                    }`
                  : 'Nothing was delivered in this window',
              ],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-tile border border-line-warm bg-paper-warm px-3.5 py-3">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
                <p className="mt-1 text-[16px] font-semibold tracking-tight text-ink">{value}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink/50">{hint}</p>
              </div>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                The {plural(rows.length, 'product')} that moved most
              </h3>
              <ul className="mt-3 space-y-2">
                {rows.map((row) => (
                  <li key={row.productId} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{row.productName}</span>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          MOVEMENT_TONE[row.movement] || 'border-line-warm text-ink/55'
                        }`}
                      >
                        {data.movementLabels?.[row.movement] || row.movement}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink/60">
                      {plural(row.units, 'unit')} this week against {plural(row.previousUnits, 'unit')} the week before ·{' '}
                      {row.changeUnits === 0 ? 'no change in units' : `${signed(row.changeUnits)} units`}
                      {row.changePct === null || row.changePct === undefined
                        ? ''
                        : ` (${signed(row.changePct)}%)`}{' '}
                      · {formatPrice(row.revenue)}
                    </p>
                    {notes.get(row.productId) && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-forest">{notes.get(row.productId)}</p>
                    )}
                    <Link
                      to={`/brand/products/${row.productId}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-forest transition hover:underline"
                    >
                      Open this listing
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              {data.soldProducts > rows.length && (
                <p className="mt-2.5 text-[11.5px] text-ink/45">
                  {plural(data.soldProducts, 'product')} sold in the window; these {rows.length} are the biggest unit
                  changes, and the dashboard list above still has the rest.
                </p>
              )}
            </div>
          )}

          {(data.stock?.alerts?.length > 0 || data.stock?.lowStockProducts > 0 || data.stock?.outOfStockProducts > 0) && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Stock you could still top up</h3>
              <p className="mt-1 text-[11.5px] text-ink/50">
                {plural(data.stock.lowStockProducts, 'line')} low and {plural(data.stock.outOfStockProducts, 'line')} out of
                stock, from your own dashboard list
                {data.stock.alertsShown < data.stock.lowStockProducts + data.stock.outOfStockProducts
                  ? `; the first ${plural(data.stock.alertsShown, 'line')} are shown`
                  : ''}
                .
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {data.stock.alerts.map((alert) => (
                  <li
                    key={`${alert.productId || 'unknown'}-${alert.status}`}
                    className="flex flex-wrap items-center gap-2 rounded-tile border border-line-warm bg-paper-warm px-3.5 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{alert.productName}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                        ALERT_TONE[alert.status] || 'border-line-warm text-ink/55'
                      }`}
                    >
                      {plural(alert.availableQuantity, 'unit')} left, warning at {alert.lowStockThreshold}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink/45">
            The tiles beside this card use the whole {plural(data.window.days, 'day')} window, so they include the day still
            running, while the three columns above deliberately do not. CityCart stores no copy of this report and sends it
            nowhere; it is read here and gone.
          </p>
        </div>
      )}
    </section>
  )
}
