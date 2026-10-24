import { useState } from 'react'
import { useRouter } from 'expo-router'
import FilterChips from '../../components/FilterChips'
import ListRow from '../../components/ListRow'
import ListScreen from '../../components/ListScreen'
import StatusPill from '../../components/StatusPill'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchOrders, ORDER_FILTERS } from '../../services/records'
import { formatPrice, timeAgo } from '../../utils/format'

export default function Orders() {
  const router = useRouter()
  const [status, setStatus] = useState(undefined)
  const list = usePagedList(`records-orders:${status || 'all'}`, (page) => fetchOrders(status, page))

  return (
    <ListScreen
      title="Orders"
      header={<FilterChips options={ORDER_FILTERS} value={status} onChange={setStatus} />}
      list={list}
      keyExtractor={(order) => order._id}
      empty={{ icon: 'package', title: 'No orders here', message: status ? 'No orders have this status.' : 'Orders will appear here.' }}
      renderItem={({ item }) => (
        <ListRow
          title={item.orderNumber}
          subtitle={[item.shippingAddress?.name, item.shippingAddress?.city].filter(Boolean).join(', ')}
          right={formatPrice(item.total)}
          rightSub={timeAgo(item.createdAt)}
          pill={<StatusPill value={item.orderStatus} />}
          onPress={() => router.push(`/order/${item._id}`)}
        />
      )}
    />
  )
}
