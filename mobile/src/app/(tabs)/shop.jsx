import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'

export default function Shop() {
  return (
    <Screen title="Shop">
      <EmptyState icon="shopping-bag" title="Coming in Phase 3" message="Search and browse every brand and product here." />
    </Screen>
  )
}
