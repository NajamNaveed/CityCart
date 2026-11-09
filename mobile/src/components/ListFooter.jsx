import { View } from 'react-native'
import AppText from './ui/AppText'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { spacing } from '../theme'

// The end of a list is not silent: a failure to fetch the next page, or to
// refresh, says so and offers another try.
export default function ListFooter({ list }) {
  if (list.moreError) {
    return (
      <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
        <AppText variant="small">Couldn&apos;t load more. {list.moreError}</AppText>
        <Button title="Try again" variant="outline" onPress={list.loadMore} />
      </View>
    )
  }
  if (list.refreshError) {
    return (
      <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
        <AppText variant="small">Couldn&apos;t refresh. {list.refreshError}</AppText>
        <Button title="Try again" variant="outline" onPress={list.refresh} />
      </View>
    )
  }
  return list.loadingMore ? <Spinner label="Loading more" /> : null
}
