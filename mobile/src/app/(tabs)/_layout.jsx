import { Tabs } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import { useCart } from '../../hooks/useCart'
import { colors, fonts } from '../../theme'

const tab = (title, icon) => ({
  title,
  tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color} />,
})

// The five places a shopper goes. The cart shows how many items it holds; unread chats arrive with Phase 6.
export default function TabsLayout() {
  const { itemCount } = useCart()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.clay,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="shop" options={tab('Shop', 'shopping-bag')} />
      <Tabs.Screen name="nearby" options={tab('Nearby', 'map-pin')} />
      <Tabs.Screen
        name="cart"
        options={{
          ...tab('Cart', 'shopping-cart'),
          tabBarBadge: itemCount > 0 ? (itemCount > 99 ? '99+' : itemCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.clay, color: colors.white, fontFamily: fonts.semibold },
        }}
      />
      <Tabs.Screen name="account" options={tab('Account', 'user')} />
    </Tabs>
  )
}
