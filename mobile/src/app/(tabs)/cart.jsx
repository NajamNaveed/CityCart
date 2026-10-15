import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'

export default function Cart() {
  return (
    <Screen title="Cart">
      <EmptyState icon="shopping-cart" title="Coming in Phase 5" message="Your basket and checkout will live here." />
    </Screen>
  )
}
