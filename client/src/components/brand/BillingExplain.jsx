import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'

/**
 * The bill explainer (docs/29 Phase 3d-6).
 *
 * CityCart holds none of a shop's money: the shop collects its own cash-on-
 * delivery and owes the platform 1% of completed sales, billed monthly (docs/15
 * §1). So the question on this screen is never "where is my payout" — it is
 * "why is this invoice this size", and every figure answering it was added up on
 * the server from records this shop already has. The model only writes the
 * paragraph and the per-line notes; when it cannot, the amounts stay on screen.
 *
 * Nothing here edits an invoice, reverses a line, verifies a payment or files a
 * help request. An issued invoice is immutable by design, and this panel has no
 * path to any of those writes.
 */

const VERDICT = {
  true: { label: 'holds', className: 'border-forest/20 bg-sage/50 text-forest' },
  false: { label: 'does not hold', className: 'border-clay/30 bg-clay/10 text-clay' },
  null: { label: 'cannot be checked', className: 'border-line-warm bg-cream text-ink/55' },
}

const day = (key) => {
  if (!key) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${key}T00:00:00`))
}

function verdictOf(ok) {
  return VERDICT[String(ok)]
}

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
      <p className="mt-1 text-[16px] font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink/50">{hint}</p>
    </div>
  )
}

export default function BillingExplain({ invoiceId }) {
  const [available, setAvailable] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api
      .post('/ai/ping')
      .then(() => active && setAvailable(true))
      .catch((err) => active && setAvailable(err?.response?.status !== 503))
    return () => {
      active = false
    }
  }, [])

  // A different invoice is a different bill: the previous read never carries over.
  useEffect(() => {
    setData(null)
    setError('')
  }, [invoiceId])

  async function ask() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/ai/billing-explain', { invoiceId })
      setData(res.data.data || {})
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Nothing was read, so try again tomorrow.'
          : getErrorMessage(err, 'This bill could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true) return null

  const money = data?.money
  const sales = data?.sales || {}
  const credits = data?.credits || {}
  const payments = data?.payments || {}
  const insight = data?.insight
  const notes = new Map((insight?.notes || []).map((note) => [note.entryId, note]))
  const lines = [...(sales.lines || []), ...(credits.lines || [])]

  return (
    <section
      aria-labelledby="billing-explain-title"
      className="rounded-card border border-line-warm bg-paper-warm p-4 sm:p-5"
    >
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI bill read
      </p>
      <h2 id="billing-explain-title" className="mt-2 font-display text-[17px] font-semibold leading-tight text-ink">
        Why this bill is this size
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/55">
        CityCart adds up the commission lines, the payments you submitted and the orders they were charged on, and
        compares those records with each other. It reads only this shop’s own invoice, changes nothing and verifies
        nothing.
      </p>

      <button
        type="button"
        onClick={ask}
        disabled={busy}
        className="mt-3 inline-flex h-9 items-center rounded-tile bg-noir px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-cream transition hover:bg-noir-soft disabled:opacity-50"
      >
        {busy ? 'Reading your records…' : data ? 'Read it again' : 'Explain this bill'}
      </button>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data?.empty && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
          No commission line is attached to this invoice, so there is nothing beyond its own numbers to explain. This
          costs you no AI request.
        </p>
      )}

      {data && !data.empty && (
        <div className="mt-4 border-t border-line-warm pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Sales charged on"
              value={money.sales.text}
              hint={`${sales.count} sale line${sales.count === 1 ? '' : 's'} on this bill`}
            />
            <Tile label="Commission" value={money.commission.text} hint={`Charged at ${data.rate.text}${data.rate.mixed ? ' — more than one rate' : ''}`} />
            <Tile
              label="Taken off"
              value={`−${money.credits.text}`}
              hint={`${credits.reversed?.text} reversed${credits.carriedIn?.count ? `, ${credits.carriedIn.amount.text} carried in` : ''}`}
            />
            <Tile label="Still owed" value={money.due.text} hint={data.invoice.statusText} />
          </div>

          {insight?.summary ? (
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink">{insight.summary}</p>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
              {data.degraded
                ? 'CityCart did the adding-up itself, but the write-up is unavailable right now. These are the figures.'
                : 'These are the figures.'}
            </p>
          )}

          <h3 className="mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
            What CityCart compared
          </h3>
          <ul className="mt-2.5 space-y-2">
            {data.checks.map((check) => {
              const verdict = verdictOf(check.ok)
              return (
                <li key={check.key} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{check.label}</span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${verdict.className}`}>
                      {verdict.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink/55">{check.detail}</p>
                </li>
              )
            })}
          </ul>

          {data.anyCheckFailed && (
            <p className="mt-2.5 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-clay">
              Two of CityCart’s own records disagree about this bill. Only the platform team can decide which one is
              right, so use the Help tab on this page — nothing here is changed, corrected or promised on your behalf.
            </p>
          )}

          {lines.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                The lines behind these numbers
              </h3>
              <ul className="mt-3 space-y-2">
                {lines.map((line) => (
                  <li key={line.entryId} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                        {line.kind === 'REVERSAL'
                          ? `${line.offBill.text} came off for a refund`
                          : `${line.commission.text} charged on ${line.eligible.text}`}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-ink/50">
                        {line.kind === 'REVERSAL' ? 'reversal' : line.sourceLabel} · {day(line.occurredOn)}
                      </span>
                    </div>
                    {line.order ? (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink/50">
                        That order records {line.order.net.text}, of which {line.order.excluded.text} is never charged
                        ({line.order.deliveryFee.text} delivery fee, {line.order.tax.text} tax).
                        {line.order.fulfilmentText ? ` ${line.order.fulfilmentText}` : ''}
                        {line.order.returned.paisa ? ` ${line.order.returned.text} is recorded as returned.` : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink/50">
                        CityCart could not read an order record for this line, so nothing is claimed about its total.
                      </p>
                    )}
                    {line.reason && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink/50">Reason recorded: “{line.reason}”</p>
                    )}
                    {notes.get(line.entryId) && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-forest">{notes.get(line.entryId).note}</p>
                    )}
                    {line.order && line.orderId && (
                      <Link
                        to={`/brand/orders/${line.orderId}`}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-forest transition hover:underline"
                      >
                        Open this order
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {(sales.restCount > 0 || credits.restCount > 0) && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink/45">
                  {sales.restCount
                    ? `The other ${sales.restCount} sale line${sales.restCount === 1 ? '' : 's'} add ${sales.restEligible.text} of sales and ${sales.restCommission.text} of commission. `
                    : ''}
                  {credits.restCount ? `${credits.restCount} further reversal(s) are counted in the total above.` : ''}
                  Everything listed here is only the largest lines; the four comparisons above cover all of them.
                </p>
              )}
            </div>
          )}

          {payments.count > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                Payments you submitted
              </h3>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {payments.byStatus
                  .filter((group) => group.count > 0)
                  .map((group) => (
                    <li
                      key={group.status}
                      className="rounded-full border border-line-warm bg-cream px-3 py-1 text-[11.5px] text-ink/60"
                    >
                      {group.label}: {group.count} · {group.amount.text}
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink/50">{payments.note}</p>
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink/45">
            {data.invoice.periodKey} bill, {data.invoice.dueOn ? `due ${day(data.invoice.dueOn)}` : 'with no due date on it'}
            {data.invoice.paidOn ? `, paid ${day(data.invoice.paidOn)}` : ''}. {data.invoice.timing.overdue === null
              ? 'Nothing here is called late.'
              : data.invoice.timing.overdue
                ? `This bill is ${data.invoice.timing.daysPastDue} day${data.invoice.timing.daysPastDue === 1 ? '' : 's'} past its due date.`
                : `It is still ${data.invoice.timing.daysUntilDue} day${data.invoice.timing.daysUntilDue === 1 ? '' : 's'} from its due date.`}{' '}
            Every amount is CityCart’s own stored figure, printed as the invoice stores it. Nothing was changed,
            verified or filed.
          </p>
        </div>
      )}
    </section>
  )
}
