import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'

const VERDICT_STYLE = {
  FLAGGED: 'bg-clay/10 text-clay',
  REVIEW: 'bg-sand text-ink/70',
  CLEAR: 'bg-forest/10 text-forest',
}

const VERDICT_LABEL = { FLAGGED: 'Likely breaks the rules', REVIEW: 'Worth a read', CLEAR: 'Looks clean' }

const LABEL_TEXT = {
  ABUSE: 'Insults or threats',
  SPAM: 'Advertising or spam',
  SCAM: 'Scam or private details',
}

/**
 * On-demand wording check for one review (docs/29 Phase 4c).
 *
 * It sends only the text the administrator is already looking at; no review id
 * leaves the page. The score comes from CityCart's own checks and the assistant
 * only explains it. Nothing is hidden, blocked or reported here — the Hide
 * review button is still the only action, and it is still the administrator's.
 */
export default function ReviewCheck({ title, comment }) {
  const text = [title, comment].filter(Boolean).join('\n').trim()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  if (!text) return null

  async function check() {
    setBusy(true)
    setError('')
    try {
      const { data: body } = await api.post('/ai/moderate', { text })
      setResult(body.data)
    } catch (err) {
      setResult(null)
      const code = err?.response?.data?.code
      if (code === 'AI_DAILY_LIMIT') {
        setError('Today’s AI requests are used up. Read the review yourself for now.')
      } else if (err?.response?.status === 503) {
        setError('The wording check is off right now. Your own reading still counts.')
      } else if (code === 'READ_ONLY') {
        setError('Read-only partners cannot run a wording check.')
      } else {
        setError(getErrorMessage(err, 'The wording check could not run just now.'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      {result ? (
        <div className="rounded-tile border border-line-warm bg-sand/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                VERDICT_STYLE[result.verdict] || VERDICT_STYLE.REVIEW
              }`}
            >
              {VERDICT_LABEL[result.verdict] || 'Checked'}
            </span>
            <span className="text-[11.5px] font-medium text-ink/60">{result.score}/100</span>
            {result.labels.map((label) => (
              <span key={label} className="rounded-full bg-paper-warm px-2 py-0.5 text-[10.5px] text-ink/55">
                {LABEL_TEXT[label] || label}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink">{result.reason}</p>
          <p className="mt-1 text-[11px] text-ink/45">
            {result.degraded ? 'CityCart’s own checks answered; the assistant is resting. ' : ''}
            This only reads the text. Nothing was hidden or reported.
          </p>
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-ink/55 transition hover:text-clay disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? 'Checking…' : 'Check again'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-warm px-3 text-[12px] font-medium text-ink/60 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? 'Reading the wording…' : 'Check wording'}
          </button>
          {error && (
            <p role="alert" className="text-[12px] text-clay">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
