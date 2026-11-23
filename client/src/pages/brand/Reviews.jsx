import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sparkles, Star } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import Stars from '../../components/Stars'
import { PageHeader, Pager, selectClass } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatDate, inputClass } from '../../ui'
import { draftErrorMessage } from '../../utils/aiDraft'

// docs/13 §8, and the reason docs/29 Phase 3c exists: the AI button words the
// answer, the shop edits it and presses Post reply. The reply endpoint is an
// ordinary one and works with the AI layer switched off.
function ReplyBox({ review, aiAvailable, onReplied }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState('')

  if (review.brandReply) {
    return (
      <div className="mt-3 rounded-tile border border-line-warm bg-sand/40 p-3.5">
        <p className="font-display text-[12px] font-medium uppercase tracking-[0.08em] text-ink/45">Your reply</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{review.brandReply.body}</p>
        <p className="mt-1.5 text-[11.5px] text-ink/45">
          Published under this review on the product page · {formatDate(review.brandReply.at)}
        </p>
      </div>
    )
  }

  async function draft() {
    setDrafting(true)
    setError('')
    try {
      const res = await api.post('/ai/reply-draft', { type: 'review', id: review._id })
      setBody(res.data.data.draft)
    } catch (err) {
      setError(draftErrorMessage(err))
    } finally {
      setDrafting(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!body.trim()) return setError('Write a reply.')
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/reviews/${review._id}/reply`, { body: body.trim() })
      onReplied(res.data.review)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label htmlFor={`reply-${review._id}`} className="sr-only">
        Reply to this review
      </label>
      <textarea
        id={`reply-${review._id}`}
        rows={2}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Reply publicly — thank them or explain what you fixed."
        className={`${inputClass} py-2.5`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="inline-flex h-9 items-center rounded-tile bg-forest px-3.5 text-[12.5px] font-medium text-cream transition hover:bg-forest-deep disabled:opacity-40"
        >
          {saving ? 'Posting…' : 'Post reply'}
        </button>
        {aiAvailable && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting}
            className="inline-flex h-9 items-center gap-1.5 rounded-tile px-3 text-[12.5px] font-medium text-ink/55 transition hover:bg-sand hover:text-clay disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {drafting ? 'Writing…' : body.trim() ? 'Rewrite with AI' : 'Draft with AI'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-clay">
          {error}
        </p>
      )}
    </form>
  )
}

export default function Reviews() {
  const [params, setParams] = useSearchParams()
  const rating = ['1', '2', '3', '4', '5'].includes(params.get('rating')) ? params.get('rating') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, reviews: [], summary: null, pagination: null, error: '' })
  const [aiAvailable, setAiAvailable] = useState(false)
  const key = JSON.stringify([rating, page])

  useEffect(() => {
    let active = true
    api
      .post('/ai/ping')
      .then(() => active && setAiAvailable(true))
      // A 503 is the kill switch (or no provider keys): keep the button hidden.
      // Other failures still show it so the click can explain why.
      .catch((err) => active && setAiAvailable(err?.response?.status !== 503))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api
      .get('/reviews/brand', { params: { limit: 10, page, ...(rating && { rating }) } })
      .then((res) => active && setState({ key, reviews: res.data.reviews, summary: res.data.summary, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, reviews: [], summary: null, pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [rating, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  // The reply is written; say so on this card without fetching the page again.
  function markReplied(updated) {
    setState((s) => ({
      ...s,
      reviews: s.reviews.map((r) => (String(r._id) === String(updated._id) ? { ...r, brandReply: updated.brandReply } : r)),
    }))
  }

  const loading = state.key !== key
  const { summary } = state

  return (
    <>
      <PageHeader
        title="Reviews"
        intro="What customers wrote about your products after their orders arrived. One public reply per review; shoppers see it under the review."
        action={
          <>
            <label htmlFor="rating" className="sr-only">
              Rating
            </label>
            <select id="rating" value={rating} onChange={(e) => update({ rating: e.target.value })} className={selectClass}>
              <option value="">All ratings</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'star' : 'stars'}
                </option>
              ))}
            </select>
          </>
        }
      />

      {summary && summary.count > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-x-10 gap-y-4 rounded-card border border-line-warm bg-paper-warm p-6">
          <div>
            <p className="font-display text-4xl font-semibold text-ink">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} className="mt-1" />
          </div>
          <p className="text-sm text-ink/55">
            Across {summary.count} {summary.count === 1 ? 'review' : 'reviews'} on all your products
          </p>
          <dl className="flex gap-5 text-sm">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="text-center">
                <dt className="text-ink/55">{n} ★</dt>
                <dd className="font-medium text-ink">{summary.distribution[n]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title={rating ? 'No reviews with that rating.' : 'No reviews yet.'}
          message={!rating ? 'Customers can review a product once their order is delivered.' : undefined}
          className="rounded-card border border-dashed border-line-warm bg-paper-warm"
        />
      ) : (
        <ul className="space-y-3">
          {state.reviews.map((r) => (
            <li key={r._id} className="rounded-card border border-line-warm bg-paper-warm p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Stars value={r.rating} />
                <span className="text-xs text-ink/55">
                  {r.reviewerName} · {formatDate(r.createdAt)}
                </span>
              </div>
              {r.title && <p className="mt-2 font-medium text-ink">{r.title}</p>}
              {r.comment && <p className="mt-1 text-[14px] leading-relaxed text-ink/55">{r.comment}</p>}
              <p className="mt-3 text-xs">
                <Link
                  to={`/brand/products/${r.productId}`}
                  className="inline-flex items-center gap-1 rounded-tile bg-sand/50 px-2.5 py-1 font-medium text-ink transition hover:text-clay"
                >
                  {r.productName}
                </Link>
              </p>
              <ReplyBox review={r} aiAvailable={aiAvailable} onReplied={markReplied} />
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}