import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'

export default function Nearby() {
  return (
    <Screen title="Nearby">
      <EmptyState icon="map-pin" title="Coming in Phase 4" message="Find brands and products in your own block, then widen the range." />
    </Screen>
  )
}
