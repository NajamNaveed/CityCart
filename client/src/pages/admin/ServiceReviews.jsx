import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Star } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import Stars from '../../components/Stars'
import { Notice, PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import useReadOnly from '../../hooks/useReadOnly'
import { formatDate } from '../../ui'

export default function ServiceReviews() {
  const readOnly = useReadOnly()
  const [params, setParams] = useSearchParams()
  const approved = ['true', 'false'].includes(params.get('approved')) ? params.get('approved') : ''
  const rating = ['1', '2', '3', '4', '5'].includes(params.get('rating')) ? params.get('rating') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, reviews: [], pagination: null, error: '' })
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const key = JSON.stringify([approved, rating, page])

  useEffect(() => {
    let active = true
    api
      .get('/admin/service-reviews', {
        params: { limit: 20, page, ...(approved && { approved }), ...(rating && { rating }) },
      })
      .then((res) => active && setState({ key, reviews: res.data.reviews, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, reviews: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [approved, rating, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  async function toggle(review) {
    setBusyId(review._id)
    setMessage({ text: '', tone: 'ok' })
    try {
      const res = await api.patch(`/admin/service-reviews/${review._id}`, { isApproved: !review.isApproved })
      setState((s) => ({
        ...s,
        reviews: s.reviews.map((r) => (r._id === review._id ? { ...r, isApproved: res.data.review.isApproved } : r)),
      }))
      setMessage({
        text: res.data.message === 'Review hidden' ? 'Review hidden from the provider page.' : 'Review shown on the provider page.',
        tone: 'ok',
      })
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusyId(null)
    }
  }

  const loading = state.key !== key

  return (
    <>
      <PageHeader
        title="Service reviews"
        intro="Reviews customers left after a confirmed provider job. Hiding one also removes it from the provider's rating."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="mb-6 flex flex-wrap gap-3">
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
        <label htmlFor="approved" className="sr-only">
          Visibility
        </label>
        <select id="approved" value={approved} onChange={(e) => update({ approved: e.target.value })} className={selectClass}>
          <option value="">Shown and hidden</option>
          <option value="true">Shown on the provider page</option>
          <option value="false">Hidden</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.reviews.length === 0 ? (
        <EmptyState icon={Star} title="No service reviews match." className="rounded-card border border-dashed border-line-warm bg-paper-warm" />
      ) : (
        <ul className="space-y-3">
          {state.reviews.map((r) => (
            <li key={r._id} className="rounded-card border border-line-warm bg-paper-warm p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <Stars value={r.rating} />
                  <StatusBadge value={r.isApproved ? 'ACTIVE' : 'INACTIVE'} />
                </span>
                <button
                  type="button"
                  disabled={readOnly || busyId === r._id}
                  onClick={() => toggle(r)}
                  className={`inline-flex h-9 items-center rounded-tile border px-3.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    r.isApproved ? 'border-clay/40 text-clay hover:border-clay' : 'border-forest text-forest hover:bg-forest hover:text-cream'
                  }`}
                >
                  {r.isApproved ? 'Hide review' : 'Show review'}
                </button>
              </div>
              {r.comment && <p className="mt-2 text-[14px] leading-relaxed text-ink/55">{r.comment}</p>}
              {r.providerReply?.body && (
                <div className="mt-3 rounded-tile bg-sand/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink/55">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {r.providerName} replied:
                  </span>{' '}
                  {r.providerReply.body}
                </div>
              )}
              <p className="mt-3 text-xs text-ink/55">
                {r.reviewerName} on {r.serviceTitle || 'a service'} ({r.providerName})
                {r.bookingNumber ? ` · ${r.bookingNumber}` : ''} · {formatDate(r.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}
