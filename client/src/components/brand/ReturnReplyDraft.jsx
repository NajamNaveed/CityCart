import { useEffect, useState } from 'react'
import { Copy, Sparkles } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCan } from '../../hooks/useCan'
import { toast } from '../ui'

/**
 * The single-return half of the returns clusterer (docs/29 Phase 3d-1).
 *
 * CityCart writes the shop's own words about one door refusal, using only the
 * reasons the customer picked. The reply is text to read, edit and copy: it
 * never sends a message, promises a refund or touches the return, and it never
 * quotes a figure — the amounts stay on the cards above it.
 */
export default function ReturnReplyDraft({ returnId }) {
  const allowed = useCan()('delivery.view')
  const [available, setAvailable] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')

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

  useEffect(() => {
    setReply('')
    setError('')
  }, [returnId])

  async function write() {
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/ai/returns-insights', { returnId })
      const data = res.data.data || {}
      setReply(data.insight?.reply || '')
      if (!data.insight?.reply) {
        setError(
          data.empty
            ? 'Nothing was refused at the door in this window, so there is nothing to say about it yet.'
            : 'CityCart could not write this up just now. The reasons on this page are still yours to answer.',
        )
      }
    } catch (err) {
      setReply('')
      setError(
        err?.response?.data?.code === 'AI_DAILY_LIMIT'
          ? 'You have used today’s AI requests. Try again tomorrow.'
          : getErrorMessage(err, 'The reply could not be written just now.'),
      )
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(reply).then(
      () => toast('Copied to the clipboard.', { type: 'success' }),
      () => toast('Could not copy. Select the text instead.', { type: 'error' }),
    )
  }

  if (available !== true || !allowed) return null

  return (
    <div className="mt-4">
      {reply ? (
        <div className="rounded-tile border border-line-warm bg-sand/40 p-3.5">
          <p className="font-display text-[12px] font-medium uppercase tracking-[0.08em] text-ink/45">
            Suggested reply to this refusal
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{reply}</p>
          <p className="mt-2 text-[11.5px] text-ink/45">
            CityCart does not message customers from this page, so this stays here — read it, change it, copy it and
            send it yourself.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-md bg-noir px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream transition-colors hover:bg-noir-soft"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </button>
            <button
              type="button"
              onClick={write}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-ink/55 transition hover:bg-canvas hover:text-clay disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {busy ? 'Writing…' : 'Try again'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={write}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-warm px-3 py-1.5 text-[12px] font-medium text-ink/60 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? 'Writing…' : 'Draft a reply to this refusal'}
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
