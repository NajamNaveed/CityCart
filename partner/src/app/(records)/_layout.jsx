import { Tabs } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import RequireRole from '../../components/RequireRole'
import { useAuth } from '../../hooks/useAuth'
import { visibleTabs } from '../../utils/permissions'
import { colors, weights } from '../../theme'

const tab = (title, icon, shown = true) => ({
  title,
  // A hidden tab is not offered at all (the server would refuse it anyway).
  href: shown ? undefined : null,
  tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color} />,
})

// The records person's places, each shown only when their permissions allow it.
export default function RecordsTabs() {
  const { user } = useAuth()
  const show = visibleTabs(user)
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.pine,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontWeight: weights.medium, fontSize: 11 },
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        }}
      >
        <Tabs.Screen name="overview" options={tab('Overview', 'grid', show.overview)} />
        <Tabs.Screen name="orders" options={tab('Orders', 'package', show.orders)} />
        <Tabs.Screen name="shipments" options={tab('Deliveries', 'truck', show.shipments)} />
        <Tabs.Screen name="money" options={tab('Money', 'dollar-sign', show.money)} />
        <Tabs.Screen name="profile" options={tab('Account', 'user')} />
      </Tabs>
    </RequireRole>
  )
}
