import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import FilterChips from '../../components/FilterChips'
import ListRow from '../../components/ListRow'
import ListScreen from '../../components/ListScreen'
import StatusPill from '../../components/StatusPill'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchShipments, SHIPMENT_FILTERS } from '../../services/records'
import { timeAgo } from '../../utils/format'

export default function Shipments() {
  const router = useRouter()
  const params = useLocalSearchParams()
  // The overview opens this list already filtered ("3 failed").
  const [status, setStatus] = useState(typeof params.status === 'string' ? params.status : undefined)
  const list = usePagedList(`records-shipments:${status || 'all'}`, (page) => fetchShipments(status, page))

  return (
    <ListScreen
      title="Deliveries"
      header={<FilterChips options={SHIPMENT_FILTERS} value={status} onChange={setStatus} />}
      list={list}
      keyExtractor={(delivery) => delivery._id}
      empty={{ icon: 'truck', title: 'No deliveries here', message: status ? 'No deliveries have this status.' : 'Deliveries appear once an order is ready for shipment.' }}
      renderItem={({ item }) => (
        <ListRow
          title={item.orderNumber || 'Order'}
          subtitle={`${item.assignedAgent || 'No rider yet'}${item.address?.city ? `, ${item.address.city}` : ''}`}
          rightSub={timeAgo(item.updatedAt || item.createdAt)}
          pill={<StatusPill value={item.status} />}
          onPress={() => router.push({ pathname: `/shipment/${item._id}`, params: { orderNumber: item.orderNumber || '' } })}
        />
      )}
    />
  )
}
