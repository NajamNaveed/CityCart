import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import Stars from '../../components/Stars'
import { PageHeader, Pager, selectClass } from '../../components/brand/Bits'
import { formatDate } from '../../ui'

export default function Reviews() {
  const [params, setParams] = useSearchParams()
  const rating = ['1', '2', '3', '4', '5'].includes(params.get('rating')) ? params.get('rating') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, reviews: [], summary: null, pagination: null, error: '' })
  const key = JSON.stringify([rating, page])

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

  const loading = state.key !== key
  const { summary } = state

  return (
    <>
      <PageHeader
        title="Reviews"
        intro="What customers wrote about your products after their orders arrived."
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
        <div className="mb-10 flex flex-wrap items-center gap-x-10 gap-y-4 border border-line bg-paper p-6">
          <div>
            <p className="text-4xl font-semibold">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} className="mt-1" />
          </div>
          <p className="text-sm text-muted">
            Across {summary.count} {summary.count === 1 ? 'review' : 'reviews'} on all your products
          </p>
          <dl className="flex gap-5 text-sm">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="text-center">
                <dt className="text-muted">{n} ★</dt>
                <dd className="font-medium">{summary.distribution[n]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {loading ? (
        <div className="h-48 animate-pulse bg-sand" />
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.reviews.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">{rating ? 'No reviews with that rating.' : 'No reviews yet.'}</p>
          {!rating && <p className="mt-1 text-sm text-muted">Customers can review a product once their order is delivered.</p>}
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {state.reviews.map((r) => (
            <li key={r._id} className="py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Stars value={r.rating} />
                <span className="text-xs text-muted">
                  {r.reviewerName} · {formatDate(r.createdAt)}
                </span>
              </div>
              {r.title && <p className="mt-2 font-medium">{r.title}</p>}
              {r.comment && <p className="mt-1 text-[15px] leading-relaxed text-muted">{r.comment}</p>}
              <p className="mt-3 text-xs">
                <Link to={`/brand/products/${r.productId}`} className="font-medium text-pine hover:underline">
                  {r.productName}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}