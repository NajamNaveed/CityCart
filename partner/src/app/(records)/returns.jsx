import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import FilterChips from '../../components/FilterChips'
import ListRow from '../../components/ListRow'
import ListScreen from '../../components/ListScreen'
import StatusPill from '../../components/StatusPill'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchReturns, RETURN_FILTERS } from '../../services/records'
import { returnSummaryLine } from '../../utils/delivery'
import { formatPrice, timeAgo } from '../../utils/format'

// The returned-goods inbox (docs/22 §F): what riders are bringing back, and what
// the store has already taken in.
export default function Returns() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const [status, setStatus] = useState(typeof params.status === 'string' ? params.status : undefined)
  const list = usePagedList(`records-returns:${status || 'all'}`, (page) => fetchReturns(status, page))

  return (
    <ListScreen
      title="Returned goods"
      header={<FilterChips options={RETURN_FILTERS} value={status} onChange={setStatus} />}
      list={list}
      keyExtractor={(ret) => ret._id}
      empty={{
        icon: 'corner-up-left',
        title: 'No returns here',
        message: status ? 'No returns have this status.' : 'Goods a customer refuses at the door appear here.',
      }}
      renderItem={({ item }) => (
        <ListRow
          title={item.orderNumber || 'Order'}
          subtitle={returnSummaryLine(item)}
          right={formatPrice(item.returnedSubtotal)}
          rightSub={timeAgo(item.createdAt)}
          pill={<StatusPill value={item.status} />}
          onPress={() => router.push({ pathname: `/return/${item._id}`, params: { orderNumber: item.orderNumber || '' } })}
        />
      )}
    />
  )
}
