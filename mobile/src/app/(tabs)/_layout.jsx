import { Tabs } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import { colors, fonts } from '../../theme'

const tab = (title, icon) => ({
  title,
  tabBarIcon: ({ color, size }) => <Feather name={icon} size={size} color={color} />,
})

// The five places a shopper goes. Badges (cart count, unread chats) arrive with their screens.
export default function TabsLayout() {
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
      <Tabs.Screen name="cart" options={tab('Cart', 'shopping-cart')} />
      <Tabs.Screen name="account" options={tab('Account', 'user')} />
    </Tabs>
  )
}
