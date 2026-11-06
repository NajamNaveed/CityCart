import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import Stars from '../../components/Stars'
import { Notice, PageHeader, Pager, selectClass } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatDate, inputClass } from '../../ui'

function ReplyForm({ review, onReplied }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (!body.trim()) return setError('Write a reply.')
    setSaving(true)
    setError('')
    try {
      const res = await api.post(`/services/provider/reviews/${review._id}/reply`, { body: body.trim() })
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
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Reply publicly — thank them or explain what you fixed."
        className={`${inputClass} py-2.5`}
      />
      {error && <p role="alert" className="text-[12.5px] text-clay">{error}</p>}
      <button
        type="submit"
        disabled={saving || !body.trim()}
        className="inline-flex h-9 items-center rounded-md bg-pine px-3.5 text-[12.5px] font-medium text-white transition hover:bg-pine-dark disabled:opacity-40"
      >
        {saving ? 'Posting…' : 'Post reply'}
      </button>
    </form>
  )
}

export default function ProviderReviews() {
  const [params, setParams] = useSearchParams()
  const rating = ['1', '2', '3', '4', '5'].includes(params.get('rating')) ? params.get('rating') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [state, setState] = useState({ key: null, reviews: [], summary: null, pagination: null, error: '' })
  const [notice, setNotice] = useState('')
  const key = JSON.stringify([rating, page])

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/reviews', { params: { limit: 10, page, ...(rating && { rating }) } })
      .then((res) =>
        active &&
        setState({ key, reviews: res.data.reviews, summary: res.data.summary, pagination: res.data.pagination, error: '' }),
      )
      .catch((err) =>
        active && setState({ key, reviews: [], summary: null, pagination: null, error: getErrorMessage(err) }),
      )
    return () => {
      active = false
    }
  }, [rating, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([name, value]) => (value ? next.set(name, value) : next.delete(name)))
    setParams(next)
  }

  function onReplied(review) {
    setState((s) => ({
      ...s,
      reviews: s.reviews.map((item) => (item._id === review._id ? { ...item, ...review } : item)),
    }))
    setNotice('Your reply is shown on your public page.')
  }

  const loading = state.key !== key
  const { summary } = state

  return (
    <>
      <PageHeader
        title="Reviews"
        intro="Reviews from customers whose booking was confirmed. Reply once to each one; replies are public."
        action={
          <label htmlFor="rating" className="sr-only">
            Rating
          </label>
        }
      />
      <Notice>{notice}</Notice>

      <div className="mb-6 flex flex-wrap gap-3">
        <select id="rating" value={rating} onChange={(e) => update({ rating: e.target.value })} className={selectClass}>
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} {value === 1 ? 'star' : 'stars'}
            </option>
          ))}
        </select>
      </div>

      {summary && summary.count > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-x-10 gap-y-4 rounded-lg border border-line bg-white p-6">
          <div>
            <p className="font-display text-4xl font-semibold text-ink">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} className="mt-1" />
          </div>
          <p className="text-sm text-muted">
            Across {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
          </p>
          <dl className="flex gap-5 text-sm">
            {[5, 4, 3, 2, 1].map((value) => (
              <div key={value} className="text-center">
                <dt className="text-muted">{value} ★</dt>
                <dd className="font-medium text-ink">{summary.distribution[value]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title={rating ? 'No reviews with that rating.' : 'No reviews yet.'}
          message={!rating ? 'A customer can review a booking once it is confirmed.' : undefined}
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <ul className="space-y-3">
          {state.reviews.map((review) => (
            <li key={review._id} className="rounded-lg border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Stars value={review.rating} />
                <span className="text-xs text-muted">
                  {review.reviewerName} · {formatDate(review.createdAt)}
                </span>
              </div>
              {review.serviceTitle && <p className="mt-1 text-[12px] font-medium text-muted">{review.serviceTitle}</p>}
              {review.comment && <p className="mt-2 text-[14px] leading-relaxed text-muted">{review.comment}</p>}
              {review.providerReply?.body ? (
                <div className="mt-3 rounded-md bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                  <span className="font-medium text-ink">Your reply: </span>
                  {review.providerReply.body}
                </div>
              ) : (
                <ReplyForm review={review} onReplied={onReplied} />
              )}
            </li>
          ))}
        </ul>
      )}

      <Pager pagination={state.pagination} onPage={(value) => update({ page: value > 1 ? String(value) : '' })} />
    </>
  )
}
