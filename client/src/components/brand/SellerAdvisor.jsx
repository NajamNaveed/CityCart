import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Button } from '../../design'
import { StatusBadge } from './Bits'

/**
 * The seller advisor panel (docs/29 Phase 3a).
 *
 * It asks one question and shows the answer beside the products the server
 * actually read, so the numbers a shop owner sees are the same ones the charts
 * on this page use. The reply is text only — nothing here writes. Restocking,
 * prices and listings still go through the normal screens the panel links to.
 *
 * With AI_ENABLED off, or no provider keys, the /ai/ping probe answers 503 and
 * the panel hides itself entirely; the dashboard works exactly as it did before.
 */
const OPENERS = [
  { label: 'What should I fix first today?', question: 'What should I fix first today?' },
  { label: 'How did sales do this month?', question: 'How have sales done over the last month?' },
  { label: 'Which products are running out?', question: 'Which products are running out and need restocking first?' },
]

const REPLY_LIMIT = 1200

export default function SellerAdvisor() {
  const [available, setAvailable] = useState(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
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

  async function ask(text) {
    const message = (text || question).trim().slice(0, REPLY_LIMIT)
    if (!message || busy) return
    setBusy(true)
    setError('')
    setAnswer(null)
    try {
      const res = await api.post('/ai/seller-advisor', { message })
      setAnswer(res.data.data || {})
      setQuestion('')
    } catch (err) {
      setError(
        err?.response?.status === 429
          ? 'You have used today’s AI allowance. The numbers on this page are still here.'
          : getErrorMessage(err, 'The advisor could not answer just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true) return null

  const products = answer?.products || []

  return (
    <section
      aria-labelledby="advisor-title"
      className="rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI advisor
          </p>
          <h2 id="advisor-title" className="mt-2 font-display text-[19px] font-semibold leading-tight text-ink">
            Ask about your own numbers
          </h2>
          <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink/55">
            It reads this shop’s sales, stock and products, then tells you what to look at first. It never changes
            anything — the buttons below take you to the screen that does.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {OPENERS.map((opener) => (
          <button
            key={opener.question}
            type="button"
            onClick={() => ask(opener.question)}
            disabled={busy}
            className="rounded-full border border-line-warm bg-cream px-3 py-1.5 text-[12px] font-medium text-ink/70 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
          >
            {opener.label}
          </button>
        ))}
      </div>

      <form
        className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, REPLY_LIMIT))}
          rows={2}
          placeholder="e.g. Which product is losing money and should go on offer?"
          aria-label="Ask the advisor about your shop"
          className="min-h-[52px] flex-1 resize-none rounded-tile border border-line-warm bg-cream px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink/35 focus:border-ink/25"
        />
        <Button type="submit" tone="primary" disabled={busy || !question.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-tile border border-clay/25 bg-clay/10 px-3.5 py-2.5 text-[12.5px] text-clay">
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-5 border-t border-line-warm pt-4">
          {answer.reply ? (
            <p className="text-[13.5px] leading-relaxed text-ink">{answer.reply}</p>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink/55">
              The advisor could not write this up just now, but these are the lines that need you first.
            </p>
          )}

          {products.length > 0 && (
            <ul className="mt-3 space-y-2">
              {products.map((product) => (
                <li key={product.productId}>
                  <Link
                    to={`/brand/products/${product.productId}`}
                    className="group flex flex-wrap items-center gap-2.5 rounded-tile border border-line-warm bg-cream px-3.5 py-2.5 transition hover:border-ink/20"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {product.productName}
                    </span>
                    {product.stockStatus && <StatusBadge value={product.stockStatus} />}
                    {typeof product.availableQuantity === 'number' && (
                      <span className="text-[11.5px] text-ink/55">{product.availableQuantity} left</span>
                    )}
                    {typeof product.daysOfCover === 'number' && (
                      <span className="text-[11.5px] text-ink/55">{product.daysOfCover} days of cover</span>
                    )}
                    {typeof product.revenue === 'number' && product.revenue > 0 && (
                      <span className="text-[11.5px] text-ink/55">Rs {product.revenue.toLocaleString('en-PK')} sold</span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink/35 transition group-hover:text-ink" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {products.length === 0 && !answer.reply && (
            <p className="mt-2 text-[12.5px] text-ink/45">Nothing came back for that question. Try another one.</p>
          )}
        </div>
      )}
    </section>
  )
}
