import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'

/**
 * The deadstock read (docs/29 Phase 3d-7).
 *
 * Which listings are sitting, how long they have sat, what the ladder takes off
 * and what the shelf is worth — all of it counted on the server from this shop's
 * own stock rows and delivered orders. The model only writes the paragraph and
 * points at listings it was shown; if it cannot answer, the figures still show.
 *
 * Nothing here changes a price. CityCart has no write path for it: the shop
 * edits the listing on the ordinary product form, or does not.
 */
const WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
]

const plural = (value, word) => `${value} ${value === 1 ? word : `${word}s`}`

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink/50">{hint}</p>
    </div>
  )
}

export default function DeadstockPricing() {
  const allowed = useCan()('products.view')
  const [available, setAvailable] = useState(null)
  const [days, setDays] = useState(30)
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
      const res = await api.post('/ai/deadstock-pricing', { days })
      setData(res.data.data || {})
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Your shelf figures below are still yours to read.'
          : getErrorMessage(err, 'The shelf could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true || !allowed) return null

  const rows = data?.shown || []
  const insight = data?.insight
  const notes = new Map((insight?.notes || []).map((item) => [String(item.productId), item.note]))
  const skipped = data?.skipped

  return (
    <section aria-labelledby="deadstock-pricing-title" className="mt-6 rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI price read
      </p>
      <h2 id="deadstock-pricing-title" className="mt-2 font-display text-[19px] font-semibold leading-tight text-ink">
        What is sitting, and what it could cost
      </h2>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
        CityCart looks at your live listings that sold nothing in the window you pick, works out how long each has waited
        and suggests a smaller price from its own ladder — at most 20% off, and never below a lower figure you already
        show on that listing. It reads only this shop, and it changes nothing.
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
          {busy ? 'Reading…' : data ? 'Read it again' : 'Read my shelf'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data?.empty && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
          Nothing was unsold for the whole {data.window.days} days this read looked at, so there is nothing to re-price.
        </p>
      )}

      {data && !data.empty && (
        <div className="mt-5 border-t border-line-warm pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Sitting"
              value={plural(data.totals.sitting, 'listing')}
              hint={`${plural(data.totals.units, 'unit')} on the shelf`}
            />
            <Tile label="Worth today" value={data.totals.valueTiedUp.text} hint="At your own current prices" />
            <Tile
              label="Given a price"
              value={plural(data.totals.priced, 'listing')}
              hint={data.totals.blocked ? `${plural(data.totals.blocked, 'listing')} refused one` : 'None refused'}
            />
            <Tile label="Less if all clear" value={data.totals.released.text} hint="Between your two prices, not a loss" />
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink/45">
            CityCart’s ladder: {data.ladder.map((rung) => `${rung.text} after ${plural(rung.fromDays, 'day')}`).join(', ')}
            . {data.marginNote}
          </p>

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
              {rows.map((row) => {
                const s = row.suggested || {}
                return (
                  <li key={row.productId} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{row.productName}</span>
                      {s.suggested ? (
                        <span className="shrink-0 rounded-full border border-clay/30 bg-clay/10 px-2.5 py-0.5 text-[11px] font-medium text-clay">
                          {s.bpsText} off
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-line-warm bg-paper-warm px-2.5 py-0.5 text-[11px] font-medium text-ink/55">
                          No suggestion
                        </span>
                      )}
                    </div>

                    {s.suggested ? (
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-2 text-[14px] font-semibold tracking-tight text-ink">
                        <span className="text-ink/45 line-through decoration-1">{s.current.text}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-ink/35" aria-hidden="true" />
                        <span>{s.suggested.text}</span>
                        {s.compare && (
                          <span className="text-[11.5px] font-normal text-ink/45">shows {s.compare.text} on the listing</span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[13px] font-medium text-ink/70">
                        {s.blocked ? s.blockReason : 'It has not sat long enough for the ladder to reach it.'}
                      </p>
                    )}

                    <p className="mt-1 text-[12px] leading-relaxed text-ink/60">
                      {plural(row.availableQuantity, 'unit')} unsold · {row.sittingText}
                      {row.lastSoldOn ? ` (on ${row.lastSoldOn})` : ''}
                      {s.value ? ` · worth ${s.value.text}${s.atSuggested ? `, ${s.atSuggested.text} at the suggested price` : ''}` : ''}
                      {s.released ? ` · ${s.released.text} less if all of it clears` : ''}
                    </p>

                    {s.clampNote && (
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/50">{s.clampNote}</p>
                    )}
                    {notes.get(row.productId) && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-forest">{notes.get(row.productId)}</p>
                    )}

                    <Link
                      to={`/brand/products/${row.productId}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-forest transition hover:underline"
                    >
                      Open this listing and set it yourself
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {skipped && data.scanned > rows.length && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink/45">
              {plural(data.scanned, 'stock position')} read. {plural(data.suggestedRows, 'listing')} of the{' '}
              {plural(data.totals.sitting, 'listing')} that qualified got a suggested price; {plural(skipped.selling, 'listing')}{' '}
              sold in the window, {plural(skipped.noStock, 'listing')} had nothing left to sell,{' '}
              {plural(skipped.notLive, 'listing')} {skipped.notLive === 1 ? 'was' : 'were'} not a live page,{' '}
              {plural(skipped.untracked, 'listing')} {skipped.untracked === 1 ? 'has' : 'have'} stock tracking off and{' '}
              {plural(skipped.missing, 'stock row')} had no listing behind it.
              {data.sampled
                ? ` This shop has more stock than one read walks, so these are the ${plural(data.scanned, 'position')} with the most units on hand.`
                : ''}
            </p>
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
            {data.moneyNote} Nothing was changed by this read: no price was saved, no stock moved, no order placed. Open a
            listing and set the price yourself, or leave it as it is.
          </p>
        </div>
      )}
    </section>
  )
}
