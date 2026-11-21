import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'

/**
 * The listing quality score (docs/29 Phase 3d-3).
 *
 * CityCart scores the listing here — every band, every point and every gap is
 * counted from the record on the server, and the same numbers are printed below
 * whether or not the model answers. The model only says, in the shop's own
 * language, what to write or photograph next.
 *
 * Nothing here saves anything. The page keeps its current fields until the shop
 * edits them above and presses Save.
 */
const STATUS_TONE = {
  GOOD: 'border-forest/15 bg-sage/40 text-forest',
  WEAK: 'border-line-warm bg-cream text-ink/60',
  MISSING: 'border-line-warm bg-cream text-ink/60',
  BROKEN: 'border-clay/25 bg-clay/10 text-clay',
  UNTRACKED: 'border-line-warm bg-cream text-ink/50',
}

export default function ListingQuality({ productId }) {
  const allowed = useCan()('products.view')
  const [available, setAvailable] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!allowed || !productId) return undefined
    let active = true
    api
      .post('/ai/ping')
      .then(() => active && setAvailable(true))
      .catch((err) => active && setAvailable(err?.response?.status !== 503))
    return () => {
      active = false
    }
  }, [allowed, productId])

  // A fresh listing has nothing saved to score, so the card starts over when the
  // shop moves to a different page.
  useEffect(() => {
    setData(null)
    setError('')
  }, [productId])

  async function ask() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/ai/listing-quality', { productId })
      setData(res.data.data || null)
    } catch (err) {
      setData(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Your own score still shows when you try again tomorrow.'
          : getErrorMessage(err, 'This listing could not be read just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true || !allowed || !productId) return null

  const insight = data?.insight
  const checks = data?.checks || []

  return (
    <section aria-labelledby="listing-quality-title" className="rounded-card border border-line-warm bg-paper-warm p-6">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        AI listing check
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h2 id="listing-quality-title" className="font-display text-[19px] font-semibold leading-tight text-ink">
          Why this page is not selling
        </h2>
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-tile bg-noir px-4 text-[12px] font-medium uppercase tracking-[0.08em] text-cream transition hover:bg-noir-soft disabled:opacity-50"
        >
          {busy ? 'Reading…' : data ? 'Score again' : 'Score this listing'}
        </button>
      </div>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
        CityCart counts what this saved listing actually holds — its words, its photos, its details, its price pair and
        its stock — and gives it 100 points to spend. It reads this shop only, and changes nothing.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-5 border-t border-line-warm pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="font-display text-[38px] leading-none font-semibold tracking-tight text-ink">
              {data.score}
              <span className="ml-1 text-[15px] font-medium text-ink/45">/ 100</span>
            </p>
            <div className="min-w-[10rem] flex-1">
              <p className="h-2 w-full overflow-hidden rounded-full bg-sand">
                <span className="block h-full rounded-full bg-forest" style={{ width: `${Math.max(2, data.score)}%` }} />
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink/55">{data.visibility.note}</p>
            </div>
          </div>

          {insight?.summary ? (
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink">{insight.summary}</p>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
              {data.degraded
                ? 'CityCart did the counting itself, but the write-up is unavailable right now. These are the points.'
                : 'These are the points.'}
            </p>
          )}

          <ul className="mt-4 space-y-2">
            {checks.map((row) => {
              const fix = insight?.fixes?.find((item) => item.key === row.key)
              return (
                <li key={row.key} className="rounded-tile border border-line-warm bg-cream px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{row.label}</span>
                    <span className="text-[12px] text-ink/55">
                      {row.points} of {row.weight}
                    </span>
                    <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-sand">
                      <span
                        className="block h-full rounded-full bg-forest"
                        style={{ width: `${Math.round((row.points / row.weight) * 100)}%` }}
                      />
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                        STATUS_TONE[row.status] || STATUS_TONE.WEAK
                      }`}
                    >
                      {row.status === 'GOOD' ? 'Full' : row.status === 'BROKEN' ? 'Wrong' : row.status === 'UNTRACKED' ? 'Not tracked' : row.points === 0 ? 'Missing' : 'Partly'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink/60">{row.facts}</p>
                  {fix && <p className="mt-1.5 text-[12.5px] leading-relaxed text-forest">Do this: {fix.what}</p>}
                </li>
              )
            })}
          </ul>

          {data.fixes.length === 0 ? (
            <p className="mt-4 text-[13px] leading-relaxed text-forest">
              Every field on this listing is at its full points. Nothing here needs doing.
            </p>
          ) : (
            <p className="mt-4 text-[11.5px] leading-relaxed text-ink/45">
              Fixes are listed by how many points each one is worth, and only the fields above can appear — CityCart
              will not tell you to fix something that is already right.
            </p>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink/45">
            This scores the listing as it is saved, so edit the fields above, save, and score it again. A score is a
            reading of the page, not a promise about sales — and nothing here publishes, prices or archives anything for
            you.
          </p>
        </div>
      )}
    </section>
  )
}
