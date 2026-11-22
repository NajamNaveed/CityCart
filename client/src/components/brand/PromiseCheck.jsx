import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'
import { humanize } from '../../ui'

/**
 * The promise check (docs/29 Phase 3d-5).
 *
 * Every minute below is a subtraction between two timestamps this shop's own
 * order records already carried, done on the server, and every duration arrives
 * already written as words so the panel and the model cannot disagree about what
 * "2.5 days" meant. The model only explains the measurement; when it cannot
 * answer, the measurement is still printed in full.
 *
 * Nothing here changes an order, messages a customer or reassigns a rider. The
 * shop's real actions stay on the ordinary delivery screens this card links to.
 */
const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
]

const plural = (value, word) => `${value} ${value === 1 ? word : `${word}s`}`

const day = (key) => {
  if (!key) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${key}T00:00:00`))
}

/** A duration the server measured, or the honest dash when it could not. */
const said = (text) => text || '—'

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink/50">{hint}</p>
    </div>
  )
}

export default function PromiseCheck() {
  const allowed = useCan()('delivery.view')
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
      const res = await api.post('/ai/promise-check', { days })
      setData(res.data.data || {})
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Nothing was measured, so try again tomorrow.'
          : getErrorMessage(err, 'The deliveries could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true || !allowed) return null

  const insight = data?.insight
  const notes = new Map((insight?.notes || []).map((item) => [String(item.orderId), item.note]))
  const measured = data?.delivered || {}
  const waiting = data?.open || {}

  return (
    <section aria-labelledby="promise-check-title" className="rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI delivery read
      </p>
      <h2 id="promise-check-title" className="mt-2 font-display text-[19px] font-semibold leading-tight text-ink">
        How long your deliveries actually take
      </h2>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
        CityCart measures the time between the timestamps your own orders already recorded, and compares them with the
        delivery timeframe written in your settings. It reads only this shop, changes no order and messages no customer.
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
          {busy ? 'Measuring…' : data ? 'Measure it again' : 'Measure my deliveries'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data?.empty && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
          No order was placed here between {day(data.window.from)} and {day(data.window.to)}, so there is nothing to
          measure yet. This costs you no AI request.
        </p>
      )}

      {data && !data.empty && (
        <div className="mt-5 border-t border-line-warm pt-4">
          <div
            className={`rounded-tile border px-3.5 py-3 ${
              data.promise.minutes === null ? 'border-clay/25 bg-clay/10' : 'border-forest/20 bg-sage/40'
            }`}
          >
            <p className="text-[12.5px] leading-relaxed text-ink">
              Your settings say:{' '}
              <span className="font-medium">“{data.promise.text || 'nothing written'}”</span>
              {data.promise.readable ? ` — read as ${data.promise.readable}.` : ' — no timeframe CityCart can read.'}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink/60">{data.promise.note}</p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="On time"
              value={measured.pct === null ? '—' : `${measured.pct}%`}
              hint={
                measured.pct === null
                  ? 'Nothing measured, or no readable promise'
                  : `${plural(measured.onTime, 'order')} within the promise, ${plural(measured.late, 'order')} outside it`
              }
            />
            <Tile
              label="Median delivery"
              value={said(data.readable.median)}
              hint={`Average ${said(measured.averageText)}, fastest ${said(measured.fastestText)}`}
            />
            <Tile
              label="Delivered"
              value={plural(measured.orders, 'order')}
              hint={`${plural(measured.measured, 'order')} measured${
                measured.missingHistory ? `, ${plural(measured.missingHistory, 'order')} with no delivery timestamp` : ''
              }`}
            />
            <Tile
              label="Still waiting"
              value={plural(waiting.orders, 'order')}
              hint={
                waiting.orders === 0
                  ? 'Nothing is out right now'
                  : `Oldest has waited ${said(waiting.oldestText)}${
                      waiting.overPromise === null
                        ? '; lateness not measured (no readable promise)'
                        : `, ${waiting.overPromise} of them already past the promise`
                    }`
              }
            />
          </div>

          {insight?.summary ? (
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink">{insight.summary}</p>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
              {data.degraded
                ? 'CityCart did the measuring itself, but the write-up is unavailable right now. These are the figures.'
                : 'These are the figures.'}
            </p>
          )}

          <div className="mt-5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
              Where the time went
            </h3>
            <ul className="mt-3 space-y-2">
              {data.stages.map((stage) => (
                <li key={stage.key} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{stage.label}</span>
                    <span className="shrink-0 text-[13px] font-semibold tracking-tight text-ink">
                      {said(stage.medianText)}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink/50">median</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink/50">{stage.note}</p>
                </li>
              ))}
            </ul>
          </div>

          {data.slowest.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                The {plural(data.slowest.length, 'order')} that took longest
              </h3>
              <ul className="mt-3 space-y-2">
                {data.slowest.map((row) => (
                  <li key={row.orderId} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">Placed {day(row.date)}</span>
                      <span className="shrink-0 text-[13px] font-semibold tracking-tight text-ink">
                        {said(row.minutesText)}
                      </span>
                      {row.overPromiseText && (
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                            row.overPromiseMinutes > 0
                              ? 'border-clay/30 bg-clay/10 text-clay'
                              : 'border-forest/20 bg-sage/50 text-forest'
                          }`}
                        >
                          {row.overPromiseText}
                        </span>
                      )}
                    </div>
                    {notes.get(row.orderId) && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-forest">{notes.get(row.orderId)}</p>
                    )}
                    <Link
                      to={`/brand/orders/${row.orderId}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-forest transition hover:underline"
                    >
                      Open this order
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {waiting.orders > 0 && waiting.statuses.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">What is still out</h3>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {waiting.statuses.map((row) => (
                  <li
                    key={row.status}
                    className="rounded-full border border-line-warm bg-cream px-3 py-1 text-[11.5px] text-ink/60"
                  >
                    {humanize(row.status)} · {plural(row.count, 'order')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.byDay.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                Days that delivered something
              </h3>
              <ul className="mt-3 space-y-1.5">
                {data.byDay.map((row) => (
                  <li
                    key={row.date}
                    className="flex flex-wrap items-baseline gap-2 rounded-tile border border-line-warm bg-paper-warm px-3.5 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{day(row.date)}</span>
                    <span className="shrink-0 text-[11.5px] text-ink/60">{plural(row.delivered, 'order')} delivered</span>
                    <span className="shrink-0 text-[11.5px] text-ink/60">median {said(row.medianText)}</span>
                    <span
                      className={`shrink-0 text-[11.5px] ${
                        row.late === null ? 'text-ink/45' : row.late > 0 ? 'text-clay' : 'text-forest'
                      }`}
                    >
                      {row.late === null ? 'lateness not measured' : `${row.late} past the promise`}
                    </span>
                  </li>
                ))}
              </ul>
              {data.daysOmitted > 0 && (
                <p className="mt-2 text-[11.5px] text-ink/45">
                  {plural(data.daysOmitted, 'earlier day')} with deliveries are left out of this list; the figures above
                  still cover all of them.
                </p>
              )}
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
            {data.dead.orders > 0
              ? `${plural(data.dead.orders, 'order')} in this window were cancelled or rejected and are counted on neither side. `
              : ''}
            {data.sampled
              ? `This shop places more orders than CityCart measures in one read, so these figures come from the newest ${plural(data.orders, 'order')} in the window. `
              : ''}
            {data.scope.note} CityCart stores no copy of this read and sends it nowhere.
          </p>
        </div>
      )}
    </section>
  )
}
