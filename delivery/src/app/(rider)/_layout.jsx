import { Tabs } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import RequireRole from '../../components/RequireRole'
import { useLocationSharing } from '../../hooks/useLocationSharing'
import { useUnreadCount } from '../../hooks/useUnreadCount'
import { colors, weights } from '../../theme'

const tab = (title, icon) => ({
  title,
  tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color} />,
})

// The rider's four places: their deliveries, the cash they hold, alerts, and their account.
export default function RiderTabs() {
  const { count, refresh } = useUnreadCount()
  // Reports the rider's position while they have chosen to share it and a delivery is out.
  useLocationSharing()
  return (
    <RequireRole role="RIDER">
      <Tabs
        screenListeners={{ tabPress: () => refresh() }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.pine,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontWeight: weights.medium, fontSize: 11 },
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        }}
      >
        <Tabs.Screen name="deliveries" options={tab('Deliveries', 'truck')} />
        <Tabs.Screen name="cash" options={tab('Cash', 'dollar-sign')} />
        <Tabs.Screen
          name="alerts"
          options={{
            ...tab('Alerts', 'bell'),
            tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.pine, color: colors.white, fontWeight: weights.semibold },
          }}
        />
        <Tabs.Screen name="account" options={tab('Account', 'user')} />
      </Tabs>
    </RequireRole>
  )
}
