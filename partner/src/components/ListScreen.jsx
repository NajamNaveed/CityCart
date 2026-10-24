import { FlatList, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from './ui/AppText'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'
import { colors, spacing } from '../theme'

// The frame every records list shares: a title, optional filters, then a paged,
// pull-to-refresh list with loading, error and empty states.
export default function ListScreen({ title, header, list, renderItem, keyExtractor, empty, skeletonHeight = 96 }) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {header}
      <FlatList
        data={list.items}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={skeletonHeight} />
              ))}
            </View>
          ) : list.error ? (
            <EmptyState icon="wifi-off" tone="error" title={`Couldn't load ${title.toLowerCase()}`} message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
          ) : (
            <EmptyState icon={empty.icon} title={empty.title} message={empty.message} />
          )
        }
        renderItem={renderItem}
      />
    </SafeAreaView>
  )
}
