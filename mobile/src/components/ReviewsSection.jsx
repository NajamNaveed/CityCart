import { View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import Button from './ui/Button'
import Skeleton from './ui/Skeleton'
import ExpandableText from './ExpandableText'
import Stars from './Stars'
import { useReviews } from '../hooks/useReviews'
import { formatDate, initial } from '../utils/product'
import { colors, radius, spacing } from '../theme'

function ReviewCard({ review }) {
  return (
    <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="label" style={{ color: colors.clay }}>
            {initial(review.reviewerName)}
          </AppText>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stars value={review.rating} />
            <AppText variant="small" style={{ fontSize: 12 }}>
              {formatDate(review.createdAt)}
            </AppText>
          </View>
          {review.title ? (
            <AppText variant="strong" style={{ marginTop: spacing.xs }}>
              {review.title}
            </AppText>
          ) : null}
          <ExpandableText text={review.comment} threshold={260} variant="small" style={{ marginTop: 2, fontSize: 14, lineHeight: 21 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
            <AppText variant="label" style={{ fontSize: 12 }}>
              {review.reviewerName}
            </AppText>
            {review.verifiedPurchase ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Feather name="check-circle" size={13} color={colors.success} />
                <AppText variant="small" style={{ fontSize: 12, color: colors.success }}>
                  Verified purchase
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

// The average, the 5-to-1 star breakdown, and the reviews five at a time.
export default function ReviewsSection({ productId }) {
  const { reviews, summary, loading, error, hasMore, loadingMore, moreError, loadMore, refresh } = useReviews(productId)

  return (
    <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.lg }}>
      <AppText variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.md }}>
        What customers say
      </AppText>

      {loading ? (
        <Skeleton height={140} style={{ borderRadius: radius.lg }} />
      ) : error ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="small">{error}</AppText>
          <Button title="Try again" variant="outline" onPress={refresh} />
        </View>
      ) : !summary || summary.count === 0 ? (
        <AppText variant="small">No reviews yet. Customers can review a product once their order has been delivered.</AppText>
      ) : (
        <View style={{ gap: spacing.md }}>
          <View style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <View>
                <AppText variant="title" style={{ fontSize: 40, lineHeight: 46 }}>
                  {summary.average.toFixed(1)}
                </AppText>
                <Stars value={summary.average} size={16} />
                <AppText variant="small" style={{ marginTop: spacing.xs }}>
                  {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {[5, 4, 3, 2, 1].map((star) => (
                  <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }} accessible accessibilityLabel={`${summary.distribution[star]} reviews with ${star} stars`}>
                    <AppText variant="small" style={{ width: 22, fontSize: 12 }}>
                      {star}★
                    </AppText>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.sand, overflow: 'hidden' }}>
                      <View style={{ width: `${(summary.distribution[star] / summary.count) * 100}%`, height: 6, backgroundColor: colors.clay }} />
                    </View>
                    <AppText variant="small" style={{ width: 22, fontSize: 12, textAlign: 'right' }}>
                      {summary.distribution[star]}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {reviews.map((review) => (
            <ReviewCard key={review._id} review={review} />
          ))}

          {moreError ? (
            <AppText variant="small" style={{ color: colors.danger }}>
              {moreError}
            </AppText>
          ) : null}
          {hasMore ? <Button title="Show more reviews" variant="outline" onPress={loadMore} loading={loadingMore} /> : null}
        </View>
      )}
    </View>
  )
}
