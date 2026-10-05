import Stars from './Stars'
import { formatDate, sectionLabel, wrap } from '../ui'

// `data` is what useProductReviews returns.
export default function ReviewsSection({ data }) {
  const { loading, reviews, summary, hasMore, loadingMore, loadMore } = data

  return (
    <section id="reviews" className={`${wrap} scroll-mt-28 border-t border-line py-14`}>
      <p className={sectionLabel}>Reviews</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">What customers say</h2>

      {loading ? (
        <div className="mt-8 h-32 animate-pulse bg-sand" />
      ) : summary.count === 0 ? (
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted">
          No reviews yet. Customers can review a product once their order has been delivered.
        </p>
      ) : (
        <div className="mt-8 grid gap-12 lg:grid-cols-[16rem_1fr]">
          <div>
            <p className="text-5xl font-semibold">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} className="mt-2 text-lg" />
            <p className="mt-2 text-sm text-muted">
              Based on {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
            </p>
            <dl className="mt-6 space-y-2 text-sm">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-3">
                  <dt className="w-8 text-muted">{star} ★</dt>
                  <dd className="flex-1">
                    <span className="block h-1.5 bg-sand">
                      <span className="block h-full bg-clay" style={{ width: `${(summary.distribution[star] / summary.count) * 100}%` }} />
                    </span>
                  </dd>
                  <dd className="w-6 text-right text-muted">{summary.distribution[star]}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <ul className="divide-y divide-line border-y border-line">
              {reviews.map((review) => (
                <li key={review._id} className="py-6">
                  <Stars value={review.rating} />
                  {review.title && <p className="mt-2 font-medium">{review.title}</p>}
                  {review.comment && <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{review.comment}</p>}
                  <p className="mt-3 text-xs text-muted">
                    {review.reviewerName}
                    {review.verifiedPurchase && ' · Verified purchase'} · {formatDate(review.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-6 text-[13px] font-medium text-clay underline underline-offset-4 hover:no-underline disabled:text-muted"
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