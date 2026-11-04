import { Tabs } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import RequireRole from '../../components/RequireRole'
import { colors, weights } from '../../theme'

const tab = (title, icon) => ({
  title,
  tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color} />,
})

// A picker's two places: the orders waiting to be picked, and their account.
export default function PickerTabs() {
  return (
    <RequireRole role="PICKER">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.pine,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontWeight: weights.medium, fontSize: 11 },
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        }}
      >
        <Tabs.Screen name="queue" options={tab('Queue', 'clipboard')} />
        <Tabs.Screen name="settings" options={tab('Account', 'user')} />
      </Tabs>
    </RequireRole>
  )
}
