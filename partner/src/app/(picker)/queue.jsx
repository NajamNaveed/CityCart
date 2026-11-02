import { useCallback, useEffect, useRef } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import ListRow from '../../components/ListRow'
import ListScreen from '../../components/ListScreen'
import StatusPill from '../../components/StatusPill'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchPickQueue } from '../../services/picker'
import { timeAgo } from '../../utils/format'

const countLabel = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function PickQueue() {
  const router = useRouter()
  const list = usePagedList('picker-queue', (page) => fetchPickQueue(page))

  // Coming back from an order shows what changed (claimed, packed, answered).
  const refreshRef = useRef(list.refresh)
  useEffect(() => {
    refreshRef.current = list.refresh
  })
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      refreshRef.current()
    }, []),
  )

  return (
    <ListScreen
      title="Pick queue"
      list={list}
      keyExtractor={(order) => order._id}
      empty={{ icon: 'clipboard', title: 'Nothing to pick', message: 'Accepted orders waiting to be picked appear here. Pull down to check.' }}
      renderItem={({ item }) => (
        <ListRow
          title={item.orderNumber}
          subtitle={`${item.customerFirstName} · ${countLabel(item.itemCount, 'item')} · ${countLabel(item.units, 'unit')}`}
          rightSub={item.waitingForCustomer ? 'Waiting for customer' : item.claimedByMe ? 'Yours' : timeAgo(item.createdAt)}
          pill={<StatusPill value={item.orderStatus} />}
          onPress={() => router.push(`/pick/${item._id}`)}
        />
      )}
    />
  )
}
