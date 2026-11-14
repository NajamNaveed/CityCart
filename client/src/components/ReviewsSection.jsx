import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import Stars from './Stars'
import api from '../services/api'
import { formatDate } from '../ui'
import { btn, eyebrow, shell } from '../design'

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
        className="mt-1 text-[14.5px] leading-relaxed text-ink/60"
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

// `data` is what useProductReviews returns. `signedIn` gates the AI summary,
// which the API only serves to signed-in callers.
export default function ReviewsSection({ data, productId, signedIn }) {
  const { loading, reviews, summary, hasMore, loadingMore, loadMore } = data
  const [aiSummary, setAiSummary] = useState(null)
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)

  useEffect(() => {
    if (!signedIn || !productId || summary.count < 3) {
      setAiSummary(null)
      setAiSummaryLoading(false)
      return undefined
    }
    let active = true
    setAiSummaryLoading(true)
    api
      .get(`/ai/products/${productId}/review-summary`)
      // The card is optional: a failure (kill switch, quota, bad output) just
      // leaves the normal reviews untouched.
      .then((res) => active && setAiSummary(res.data.data.summary || null))
      .catch(() => active && setAiSummary(null))
      .finally(() => active && setAiSummaryLoading(false))
    return () => {
      active = false
    }
  }, [signedIn, productId, summary.count])

  return (
    <section id="reviews" className="scroll-mt-24 border-t border-line-warm bg-canvas py-14">
      <div className={shell}>
        <p className={eyebrow}>Reviews</p>
      <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        What customers say
      </h2>

      {!loading && summary.count >= 3 && (aiSummaryLoading || aiSummary) && (
        <div className="mt-8 rounded-card border border-line-warm bg-paper-warm p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-forest px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cream">
              AI
            </span>
            <p className="text-[13px] font-medium text-ink">AI summary</p>
          </div>
          {aiSummaryLoading ? (
            <div className="mt-3 h-14 animate-pulse rounded-md bg-sand" aria-hidden="true" />
          ) : (
            <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-ink/70">{aiSummary}</p>
          )}
          <p className="mt-2.5 text-xs text-ink/45">
            Generated from {summary.count} {summary.count === 1 ? 'review' : 'reviews'}. AI can make mistakes.
          </p>
        </div>
      )}

      {loading ? (
        <div className="mt-8 h-36 animate-pulse rounded-lg bg-sand" />
      ) : summary.count === 0 ? (
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink/60">
          No reviews yet. Customers can review a product once their order has been delivered.
        </p>
      ) : (
        <div className="mt-9 grid gap-10 lg:grid-cols-[17rem_1fr]">
          {/* Summary card */}
          <div className="h-fit rounded-card border border-line-warm bg-paper-warm p-6 lg:sticky lg:top-24">
            <p className="font-display text-5xl font-semibold text-ink">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} className="mt-2.5 text-lg" />
            <p className="mt-2 text-[13px] text-ink/55">
              Based on {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
            </p>
            <dl className="mt-6 space-y-2 text-[13px]">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-3">
                  <dt className="w-8 text-ink/55">{star} ★</dt>
                  <dd className="flex-1">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-sand">
                      <span
                        className="block h-full rounded-full bg-clay transition-all duration-700"
                        style={{ width: `${(summary.distribution[star] / summary.count) * 100}%` }}
                      />
                    </span>
                  </dd>
                  <dd className="w-6 text-right text-ink/55">{summary.distribution[star]}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Review list — paginated by useProductReviews (5 at a time) */}
          <div className="space-y-4">
            {reviews.map((review) => (
              <article key={review._id} className="rounded-card border border-line-warm bg-paper-warm p-5">
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
                      <p className="text-xs text-ink/50">{formatDate(review.createdAt)}</p>
                    </div>
                    {review.title && <p className="mt-1.5 font-medium text-ink">{review.title}</p>}
                    <ReviewBody comment={review.comment} />
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/50">
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
                className={`w-full ${btn('outline', 'md')} disabled:opacity-50`}
              >
                {loadingMore ? 'Loading…' : 'Show more reviews'}
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
