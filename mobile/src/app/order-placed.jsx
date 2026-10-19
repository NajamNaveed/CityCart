import { Pressable, ScrollView, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../components/ui/AppText'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { takePlacedOrders } from '../services/orders'
import { formatPrice } from '../utils/format'
import { colors, spacing } from '../theme'

export default function OrderPlaced() {
  const router = useRouter()
  const orders = takePlacedOrders()

  // Opened with nothing just placed (an old link, or the app restarted): go to the orders list.
  if (orders.length === 0) return <Redirect href="/orders" />

  const total = orders.reduce((sum, order) => sum + (order.total || 0), 0)
  const many = orders.length > 1

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xxl, alignItems: 'center', gap: spacing.lg }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check" size={36} color={colors.success} />
        </View>
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
            Order placed!
          </AppText>
          <AppText variant="small" style={{ textAlign: 'center' }}>
            {many ? `Your cart had ${orders.length} brands, so we created ${orders.length} orders.` : 'The brand has been notified and will confirm it shortly.'} Pay {formatPrice(total)} in cash when
            {many ? ' they arrive.' : ' it arrives.'}
          </AppText>
        </View>

        <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
          {orders.map((order) => (
            <Pressable key={order._id} onPress={() => router.replace(`/orders/${order._id}`)} accessibilityRole="button" accessibilityLabel={`Order ${order.orderNumber}, ${formatPrice(order.total)}. Track it`}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="strong">{order.orderNumber}</AppText>
                  <AppText variant="small">
                    {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'} · {formatPrice(order.total)}
                  </AppText>
                </View>
                <AppText variant="label" style={{ color: colors.clay }}>
                  Track
                </AppText>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Card>
            </Pressable>
          ))}
        </View>

        <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
          <Button title="View my orders" onPress={() => router.replace('/orders')} />
          <Button title="Continue shopping" variant="outline" onPress={() => router.replace('/shop')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
