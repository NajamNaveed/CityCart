import { useState } from 'react'
import { Star } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import Stars from './Stars'
import { btnPrimary, formatDate, inputClass } from '../ui'

/**
 * The review controls under one delivered order item: write it, then edit or delete it.
 * `review` is the customer's existing review of this product (or undefined).
 */
export default function OrderItemReview({ orderId, item, review, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(review?.rating || 0)
  const [title, setTitle] = useState(review?.title || '')
  const [comment, setComment] = useState(review?.comment || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function open() {
    setRating(review?.rating || 0)
    setTitle(review?.title || '')
    setComment(review?.comment || '')
    setError('')
    setEditing(true)
  }

  async function save(e) {
    e.preventDefault()
    if (!rating) {
      setError('Choose a rating from 1 to 5 stars.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = review
        ? await api.patch(`/reviews/${review._id}`, { rating, title, comment })
        : await api.post('/reviews', { orderId, productId: item.productId, rating, ...(title.trim() && { title }), ...(comment.trim() && { comment }) })
      onSaved(res.data.review)
      setEditing(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.delete(`/reviews/${review._id}`)
      onDeleted(review._id)
      setConfirmDelete(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="mt-4 space-y-4 rounded-lg border border-line bg-white p-5" noValidate>
        <div>
          <p className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">Your rating</p>
          <div role="radiogroup" aria-label="Rating" className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                onClick={() => setRating(n)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-7 w-7 ${n <= rating ? 'fill-clay text-clay' : 'fill-transparent text-line'}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor={`title-${item.productId}`} className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            Headline
          </label>
          <input id={`title-${item.productId}`} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Optional, e.g. Soft cloth, true colours" className={`h-11 ${inputClass}`} />
        </div>
        <div>
          <label htmlFor={`comment-${item.productId}`} className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            Your review
          </label>
          <textarea id={`comment-${item.productId}`} rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional. What did you like or dislike?" className={`${inputClass} py-3`} />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-clay/5 px-3 py-2 text-sm text-clay">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Saving…' : review ? 'Save changes' : 'Post review'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-[13px] text-muted transition hover:text-ink">
            Cancel
          </button>
        </div>
      </form>
    )
  }

  if (!review) {
    return (
      <button
        type="button"
        onClick={open}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink transition hover:border-ink"
      >
        <Star className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
        Write a review
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-white p-4">
      <Stars value={review.rating} />
      {review.title && <p className="mt-1.5 font-medium text-ink">{review.title}</p>}
      {review.comment && <p className="mt-1 text-[14px] text-muted">{review.comment}</p>}
      <p className="mt-2 text-xs text-muted">Reviewed {formatDate(review.createdAt)}</p>
      {review.isApproved === false && <p className="mt-1.5 text-xs text-clay">This review is currently hidden by CityCart.</p>}
      {error && <p className="mt-1.5 text-xs text-clay">{error}</p>}
      <div className="mt-2.5 flex items-center gap-4 text-[13px] font-medium">
        <button type="button" onClick={open} className="text-clay transition hover:text-clay-dark">
          Edit
        </button>
        {confirmDelete ? (
          <span className="flex items-center gap-3 font-normal text-muted">
            Delete this review?
            <button type="button" disabled={busy} onClick={remove} className="font-medium text-danger">
              Yes
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="hover:text-ink">
              No
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-muted transition hover:text-danger">
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
