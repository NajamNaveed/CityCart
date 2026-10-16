import { Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import { colors, minTouch } from '../theme'

// Goes back; if there is nothing to go back to (opened from a link), goes home.
export default function BackButton({ onDark = false }) {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      style={{
        width: minTouch - 6,
        height: minTouch - 6,
        borderRadius: (minTouch - 6) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onDark ? 'rgba(255,255,255,0.9)' : colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Feather name="arrow-left" size={20} color={colors.ink} />
    </Pressable>
  )
}
