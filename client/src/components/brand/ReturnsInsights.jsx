import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'
import { formatPrice } from '../../ui'
import { reasonLabel } from '../../utils/returns'

/**
 * The returns reason clusterer (docs/29 Phase 3d-1).
 *
 * CityCart does the counting on the server and sends it back as numbers, so
 * every figure here is the same one the returns page and the receive screen
 * use. The model only writes the sentence and the fixes on top of those
 * numbers, and if it cannot, the counts still show.
 *
 * Nothing here changes a return. Goods are still taken in, restocked or
 * written off on the return's own screen.
 */
const WINDOWS = [
  { days: 30, label: 'Last month' },
  { days: 90, label: 'Last 3 months' },
  { days: 365, label: 'Last year' },
]

export default function ReturnsInsights() {
  const allowed = useCan()('delivery.view')
  const [available, setAvailable] = useState(null)
  const [days, setDays] = useState(90)
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
      const res = await api.post('/ai/returns-insights', { days })
      setData(res.data.data || {})
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Your returns and their totals are still below.'
          : getErrorMessage(err, 'The patterns could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true || !allowed) return null

  const insight = data?.insight
  const reasons = data?.reasons || []
  const products = data?.products || []

  return (
    <section
      aria-labelledby="returns-insights-title"
      className="mb-6 rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6"
    >
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI returns read
      </p>
      <h2 id="returns-insights-title" className="mt-2 font-display text-[19px] font-semibold leading-tight text-ink">
        Why goods come back
      </h2>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
        CityCart counts your own refused deliveries — the reasons, the units and the money — then tells you which of
        them look like a pattern worth fixing. It reads only this shop and changes nothing.
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
          {busy ? 'Reading…' : data ? 'Check again' : 'Find the patterns'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data?.empty && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
          Nothing was refused at the door in that window, so there is nothing to explain.
        </p>
      )}

      {data && !data.empty && (
        <div className="mt-5 border-t border-line-warm pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Returns', data.totals.returns, `${data.totals.lines} lines, ${data.totals.units} units`],
              ['Goods refused', formatPrice(data.totals.returnedSubtotal), 'This window only, from the return records'],
              [
                'Refunded',
                formatPrice(data.totals.refundAmount),
                `${data.totals.storeFaultPct}% of lines were the shop’s fault`,
              ],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink/50">{label}</p>
                <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">{value}</p>
                <p className="mt-0.5 text-[11.5px] text-ink/50">{hint}</p>
              </div>
            ))}
          </div>

          {insight?.summary ? (
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink">{insight.summary}</p>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
              {data.degraded
                ? 'CityCart did the counting itself, but the write-up is unavailable right now. These are the counts.'
                : 'These are the counts.'}
            </p>
          )}

          {insight?.themes?.length > 0 && (
            <ul className="mt-3 space-y-2.5">
              {insight.themes.map((theme) => {
                const counted = reasons.find((row) => row.reason === theme.reason)
                return (
                  <li key={theme.reason} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-ink">
                      {reasonLabel(theme.reason)}
                      <span className="text-[11.5px] font-normal text-ink/50">
                        {counted?.lines || 0} {counted?.lines === 1 ? 'line' : 'lines'}
                      </span>
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink/75">{theme.cause}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-forest">Worth doing: {theme.fix}</p>
                  </li>
                )
              })}
            </ul>
          )}

          {reasons.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">Refusals by reason</h3>
              <ul className="mt-2.5 space-y-2">
                {reasons.map((row) => (
                  <li key={row.reason} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    <span className="w-28 shrink-0 font-medium text-ink">{reasonLabel(row.reason)}</span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sand">
                      <span
                        className={`block h-full rounded-full ${row.storeFault ? 'bg-clay' : 'bg-forest'}`}
                        style={{ width: `${Math.max(2, row.sharePct)}%` }}
                      />
                    </span>
                    <span className="shrink-0 text-ink/55">
                      {row.lines} {row.lines === 1 ? 'line' : 'lines'} · {row.sharePct}% · {formatPrice(row.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {products.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                Products that came back more than once
              </h3>
              <ul className="mt-2.5 space-y-2">
                {products.map((product) => (
                  <li key={product.productId || product.productName}>
                    <div className="flex flex-wrap items-center gap-2.5 rounded-tile border border-line-warm bg-cream px-3.5 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{product.productName}</span>
                      <span className="text-[11.5px] text-ink/55">
                        {product.lines} {product.lines === 1 ? 'line' : 'lines'} in {product.returns}{' '}
                        {product.returns === 1 ? 'return' : 'returns'}
                      </span>
                      <span className="text-[11.5px] text-ink/55">
                        mostly {reasonLabel(product.topReason)} ({product.dominant})
                      </span>
                      <span className="text-[11.5px] text-ink/55">{formatPrice(product.value)}</span>
                      {product.productId && (
                        <Link
                          to={`/brand/products/${product.productId}`}
                          className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-forest transition hover:underline"
                        >
                          Open listing
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {data.productCount > products.length && (
                <p className="mt-2 text-[11.5px] text-ink/45">
                  Showing the {products.length} most returned of {data.productCount} products.
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink/45">
            The reasons come from what the customer refused at the door. Prices, stock and taking goods in still happen
            on each return’s own screen — this panel only reads.
          </p>
        </div>
      )}
    </section>
  )
}
