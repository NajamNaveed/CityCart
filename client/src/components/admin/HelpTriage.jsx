import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { toast } from '../ui'

const URGENCY_STYLE = {
  HIGH: 'bg-clay/10 text-clay',
  NORMAL: 'bg-sand text-ink/70',
  LOW: 'bg-sand/60 text-ink/50',
}

const URGENCY_LABEL = { HIGH: 'Urgent', NORMAL: 'Normal', LOW: 'Low' }

/**
 * Billing triage for one seller question (docs/29 Phase 4b).
 *
 * It reads CityCart's own records for this seller — what is owed, how old it
 * is, which claims are waiting — and suggests a category, an urgency and a
 * draft the administrator can edit. Nothing is sent from here: the ordinary
 * answer button below still owns that action.
 */
export default function HelpTriage({ request, onUse }) {
  const [available, setAvailable] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setResult(null)
    setError('')
  }, [request?._id])

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

  async function suggest() {
    setBusy(true)
    setError('')
    try {
      const { data: body } = await api.post('/ai/admin-triage', { helpId: request._id })
      setResult(body.data)
      if (body.data?.degraded) {
        toast('The assistant is resting, so CityCart used its own billing rules for this draft.', {
          type: 'info',
        })
      }
    } catch (err) {
      setResult(null)
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'Today’s AI requests are used up. Answer from the records below.'
          : getErrorMessage(err, 'A suggestion could not be prepared just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (available !== true) return null

  return (
    <div className="rounded-tile border border-line-warm bg-sand/40 p-3">
      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-cream">
              {result.classification?.label || 'Suggestion'}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                URGENCY_STYLE[result.classification?.urgency] || URGENCY_STYLE.NORMAL
              }`}
            >
              {URGENCY_LABEL[result.classification?.urgency] || 'Normal'}
            </span>
            {result.facts?.balance && (
              <span className="text-[11.5px] text-ink/55">Owes {result.facts.balance.text}</span>
            )}
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{result.draft}</p>
          <p className="mt-1.5 text-[11.5px] text-ink/45">
            Nothing has been sent. Read it, change anything you need, then press Send answer yourself.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onUse(result.draft)
                toast('Draft placed in the answer box.', { type: 'success' })
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-noir px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream transition-colors hover:bg-noir-soft"
            >
              Use this draft
            </button>
            <button
              type="button"
              onClick={suggest}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-ink/55 transition hover:bg-canvas hover:text-clay disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {busy ? 'Reading…' : 'Try again'}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={suggest}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-warm px-3 py-1.5 text-[12px] font-medium text-ink/60 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? 'Reading the records…' : 'Suggest a category and reply'}
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
