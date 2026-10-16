import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { colors, minTouch, spacing } from '../theme'

// The frame for the sign-in and register screens: a way out, a heading, and a
// form that stays visible above the keyboard.
export default function AuthShell({ title, subtitle, children }) {
  const router = useRouter()
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={{ width: minTouch, height: minTouch, marginLeft: -spacing.md, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={24} color={colors.ink} />
          </Pressable>

          <View style={{ marginTop: spacing.md, marginBottom: spacing.xl }}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="small" style={{ marginTop: spacing.xs }}>
                {subtitle}
              </AppText>
            ) : null}
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
