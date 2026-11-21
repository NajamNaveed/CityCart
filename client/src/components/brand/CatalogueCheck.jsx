import { useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { formatPrice } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-ink/55'

function sizeText(size) {
  return size?.value ? `${size.value} ${size.unit}` : ''
}

function words(row) {
  const parts = []
  if (row.matchedTokens?.length) parts.push(`matched ${row.matchedTokens.join(', ')}`)
  if (row.missingTokens?.length) parts.push(`missing ${row.missingTokens.join(', ')}`)
  return parts.join(' · ')
}

function scoreText(row) {
  const matched = `${row.score}% of the words you typed`
  const detail = words(row)
  return detail ? `${matched} — ${detail}.` : `${matched}.`
}

/**
 * Duplicate check before a new product is requested (docs/29 Phase 3b).
 * The server does the matching; this only shows what it found, and every action
 * leads back to the ordinary screens — nothing here creates or changes anything.
 */
export default function CatalogueCheck({ query, barcode, categoryName, onSearch }) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function check() {
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/ai/catalogue-match', {
        query: query.trim(),
        ...(barcode?.trim() && { barcode: barcode.trim() }),
        ...(categoryName && { categoryName }),
      })
      setResult(res.data.data)
    } catch (err) {
      setResult(null)
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const nothing = result && result.matches.length === 0 && result.duplicates.length === 0

  return (
    <div className="rounded-md border border-line-warm bg-paper-warm p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-forest px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cream">AI</span>
        <p className="text-[13.5px] font-medium text-ink">Is this product already in CityCart?</p>
      </div>
      <p className="mt-1 text-xs text-ink/55">
        Checks the product name and barcode you typed against the catalogue and against your own listings before you send the request.
      </p>
      <button
        type="button"
        onClick={check}
        disabled={busy || query.trim().length < 3}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-forest/40 bg-forest/5 px-4 text-[13px] font-medium text-forest transition hover:border-forest disabled:opacity-50"
      >
        {busy ? 'Checking…' : result ? 'Check again' : 'Check for duplicates'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-clay">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          {result.degraded && (
            <p className="text-xs text-ink/55">
              The assistant is not answering right now, so these are CityCart’s own matches with no explanation.
            </p>
          )}
          {result.reply && <p className="text-[13.5px] text-ink">{result.reply}</p>}

          {nothing && (
            <p className="rounded-md bg-forest/5 px-3.5 py-2.5 text-[13px] text-ink">
              Nothing in the catalogue or in your own products looks like “{query.trim()}”, so this is worth requesting.
            </p>
          )}

          {result.matches.length > 0 && (
            <div>
              <p className={labelClass}>Already in the catalogue</p>
              <ul className="divide-y divide-line-warm rounded-md border border-line-warm">
                {result.matches.map((item) => (
                  <li key={item.catalogProductId} className="px-4 py-2.5 text-[13.5px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{item.name}</span>
                        <span className="ml-2 text-xs text-ink/55">
                          {[item.manufacturer, sizeText(item.size), item.category].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onSearch(item.name)}
                        className="text-[13px] font-medium text-forest underline"
                      >
                        Find it above
                      </button>
                    </div>
                    <p className="mt-0.5 text-xs text-ink/55">
                      {item.sameBarcode ? 'Same barcode as the one you typed. ' : ''}
                      {scoreText(item)}
                      {item.listedByYou && ' You already list it, so you only need a price and stock on that product.'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.duplicates.length > 0 && (
            <div>
              <p className={labelClass}>You already sell this</p>
              <ul className="divide-y divide-line-warm rounded-md border border-line-warm">
                {result.duplicates.map((row) => (
                  <li key={row.productId} className="px-4 py-2.5 text-[13.5px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">{row.name}</span>
                      <span className="text-xs text-ink/55">
                        {formatPrice(row.price)} · {row.status === 'ACTIVE' ? 'live' : row.status === 'DRAFT' ? 'draft' : 'hidden'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink/55">
                      {scoreText(row)} A second product for the same thing splits its sales and reviews.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
