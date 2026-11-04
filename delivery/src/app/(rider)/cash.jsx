import { View } from 'react-native'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import Skeleton from '../../components/ui/Skeleton'
import { useRemote } from '../../hooks/useRemote'
import { fetchCash } from '../../services/deliveries'
import { formatPrice } from '../../utils/format'
import { colors, spacing } from '../../theme'

export default function Cash() {
  const cash = useRemote('cash', fetchCash)

  return (
    <Screen title="Cash" subtitle="Money you collected on delivery." refreshing={cash.refreshing} onRefresh={cash.reload}>
      {cash.status === 'loading' ? (
        <Skeleton height={140} />
      ) : cash.status === 'error' ? (
        <EmptyState icon="wifi-off" tone="error" title="Couldn't load your cash" message={cash.error} action={<Button title="Try again" onPress={cash.reload} />} />
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small">You are holding</AppText>
          <AppText variant="big" style={{ color: colors.pine }}>
            {formatPrice(cash.data.total)}
          </AppText>
          <View>
            <AppText variant="small">
              {cash.data.count === 0
                ? 'No cash to hand over.'
                : `From ${cash.data.count} ${cash.data.count === 1 ? 'delivery' : 'deliveries'}. Give it to your brand's records person, who marks it as received.`}
            </AppText>
          </View>
        </Card>
      )}
    </Screen>
  )
}
