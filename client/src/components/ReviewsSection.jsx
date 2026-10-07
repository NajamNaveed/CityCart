import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import Stars from './Stars'
import { formatDate, sectionLabel, wrap } from '../ui'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// A review whose long comment collapses behind a toggle.
function ReviewBody({ comment }) {
  const [expanded, setExpanded] = useState(false)
  if (!comment) return null
  const clampable = comment.length > 260
  return (
    <>
      <p
        className="mt-1 text-[14.5px] leading-relaxed text-muted"
        style={
          clampable && !expanded
            ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
            : undefined
        }
      >
        {comment}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[12.5px] font-medium text-clay underline-offset-4 hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  )
}

// `data` is what useProductReviews returns.
export default function ReviewsSection({ data }) {
  const { loading, reviews, summary, hasMore, loadingMore, loadMore } = data

  return (
    <section id="reviews" className={`${wrap} scroll-mt-24 border-t border-line py-14`}>
      <p className={sectionLabel}>Reviews</p>
      <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        What customers say
      </h2>

      {loading ? (
        <div className="mt-8 h-36 animate-pulse rounded-lg bg-sand" />
      ) : summary.count === 0 ? (
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted">
          No reviews yet. Customers can review a product once their order has been delivered.
        </p>
      ) : (
        <div className="mt-9 grid gap-10 lg:grid-cols-[17rem_1fr]">
          {/* Summary card */}
          <div className="h-fit rounded-lg border border-line bg-white p-6 lg:sticky lg:top-24">
            <p className="font-display text-5xl font-semibold text-ink">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} className="mt-2.5 text-lg" />
            <p className="mt-2 text-[13px] text-muted">
              Based on {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
            </p>
            <dl className="mt-6 space-y-2 text-[13px]">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-3">
                  <dt className="w-8 text-muted">{star} ★</dt>
                  <dd className="flex-1">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-sand">
                      <span
                        className="block h-full rounded-full bg-clay transition-all duration-700"
                        style={{ width: `${(summary.distribution[star] / summary.count) * 100}%` }}
                      />
                    </span>
                  </dd>
                  <dd className="w-6 text-right text-muted">{summary.distribution[star]}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Review list — paginated by useProductReviews (5 at a time) */}
          <div className="space-y-4">
            {reviews.map((review) => (
              <article key={review._id} className="rounded-lg border border-line bg-white p-5">
                <div className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-[13px] font-semibold text-clay"
                  >
                    {initials(review.reviewerName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Stars value={review.rating} />
                      <p className="text-xs text-muted">{formatDate(review.createdAt)}</p>
                    </div>
                    {review.title && <p className="mt-1.5 font-medium text-ink">{review.title}</p>}
                    <ReviewBody comment={review.comment} />
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span className="font-medium text-ink/80">{review.reviewerName}</span>
                      {review.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-success">
                          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Verified purchase
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </article>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-line bg-white text-[13px] font-medium text-ink transition hover:border-ink disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Show more reviews'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
