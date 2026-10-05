import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import Stars from '../../components/Stars'
import { Notice, PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { formatDate } from '../../ui'

export default function Reviews() {
  const [params, setParams] = useSearchParams()
  const approved = ['true', 'false'].includes(params.get('approved')) ? params.get('approved') : ''
  const rating = ['1', '2', '3', '4', '5'].includes(params.get('rating')) ? params.get('rating') : ''
  const brandId = params.get('brandId') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [brands, setBrands] = useState([])
  const [state, setState] = useState({ key: null, reviews: [], pagination: null, error: '' })
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const key = JSON.stringify([approved, rating, brandId, page])

  useEffect(() => {
    let active = true
    api
      .get('/admin/brands', { params: { limit: 50 } })
      .then((res) => active && setBrands(res.data.brands))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api
      .get('/admin/reviews', { params: { limit: 20, page, ...(approved && { approved }), ...(rating && { rating }), ...(brandId && { brandId }) } })
      .then((res) => active && setState({ key, reviews: res.data.reviews, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, reviews: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [approved, rating, brandId, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  async function toggle(review) {
    setBusyId(review._id)
    setMessage({ text: '', tone: 'ok' })
    try {
      const res = await api.patch(`/admin/reviews/${review._id}`, { isApproved: !review.isApproved })
      setState((s) => ({ ...s, reviews: s.reviews.map((r) => (r._id === review._id ? { ...r, isApproved: res.data.review.isApproved } : r)) }))
      setMessage({ text: res.data.message === 'Review hidden' ? 'Review hidden from the shop.' : 'Review shown in the shop again.', tone: 'ok' })
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusyId(null)
    }
  }

  const loading = state.key !== key

  return (
    <>
      <PageHeader title="Reviews" intro="Every review on the platform. Hide one that breaks the rules; the customer can still see it." />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="mb-6 flex flex-wrap gap-3">
        <label htmlFor="brand" className="sr-only">
          Brand
        </label>
        <select id="brand" value={brandId} onChange={(e) => update({ brandId: e.target.value })} className={selectClass}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>
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
          <option value="true">Shown in the shop</option>
          <option value="false">Hidden</option>
        </select>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse bg-sand" />
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.reviews.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">No reviews match.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {state.reviews.map((r) => (
            <li key={r._id} className="py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <Stars value={r.rating} />
                  <StatusBadge value={r.isApproved ? 'ACTIVE' : 'INACTIVE'} />
                </span>
                <button
                  type="button"
                  disabled={busyId === r._id}
                  onClick={() => toggle(r)}
                  className={`text-[13px] font-medium hover:underline ${r.isApproved ? 'text-clay' : 'text-ink'}`}
                >
                  {r.isApproved ? 'Hide review' : 'Show review'}
                </button>
              </div>
              {r.title && <p className="mt-2 font-medium">{r.title}</p>}
              {r.comment && <p className="mt-1 text-[15px] leading-relaxed text-muted">{r.comment}</p>}
              <p className="mt-3 text-xs text-muted">
                {r.customerName} on {r.productName} ({r.brandName}) · {formatDate(r.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}