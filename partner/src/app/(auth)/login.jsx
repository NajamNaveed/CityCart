import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Redirect } from 'expo-router'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { useAuth } from '../../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../../services/api'
import { sentenceAll, validateLogin } from '../../utils/validation'
import { colors, radius, spacing } from '../../theme'

export default function Login() {
  const { status, offline, login, chooseWorkspace } = useAuth()

  const passwordRef = useRef(null)
  const [form, setForm] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [workspace, setWorkspace] = useState(null)

  // Signing in flips `status`; this one redirect then sends each person to their own screens.
  if (status === 'signedIn') return <Redirect href="/" />

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  async function onSubmit() {
    if (submitting) return
    const problems = validateLogin(form)
    setFieldErrors(problems)
    setError('')
    if (Object.keys(problems).length > 0) return

    setSubmitting(true)
    try {
      await login({ email: form.email.trim().toLowerCase(), password: form.password })
    } catch (err) {
      if (err.workspace) {
        setWorkspace(err.workspace)
      } else {
        setFieldErrors(sentenceAll(getFieldErrors(err)))
        setError(getErrorMessage(err))
      }
      setSubmitting(false)
    }
  }

  async function pickWorkspace(membership) {
    setError('')
    setSubmitting(true)
    try {
      await chooseWorkspace({ workspaceToken: workspace.workspaceToken, brandId: membership.brandId })
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  const banner = error || (offline ? 'Cannot reach the server. Check your connection.' : '')

  if (workspace) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xl }}>
            <AppText variant="title" accessibilityRole="header">
              Choose a workspace
            </AppText>
            <AppText variant="small" style={{ marginTop: spacing.xs }}>
              {form.email.trim()} is a team member at more than one brand.
            </AppText>
          </View>

          {banner ? (
            <View
              accessibilityRole="alert"
              style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}
            >
              <AppText variant="small" style={{ color: colors.danger }}>
                {banner}
              </AppText>
            </View>
          ) : null}

          {workspace.memberships.map((m) => (
            <View key={m.brandId} style={{ marginBottom: spacing.md }}>
              <Button
                title={`${m.brandName}${m.role === 'PICKER' ? ' · Picker' : ''}`}
                variant="outline"
                onPress={() => pickWorkspace(m)}
                loading={submitting}
              />
            </View>
          ))}

          <Button
            title="Use a different account"
            variant="outline"
            onPress={() => {
              setWorkspace(null)
              setError('')
            }}
          />
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xl }}>
            <AppText variant="title" accessibilityRole="header">
              CityCart Staff
            </AppText>
            <AppText variant="small" style={{ marginTop: spacing.xs }}>
              For pickers and brand team members. Use the email and password your brand gave you.
            </AppText>
          </View>

          {banner ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}
            >
              <AppText variant="small" style={{ color: colors.danger }}>
                {banner}
              </AppText>
            </View>
          ) : null}

          <TextField
            label="Email"
            value={form.email}
            onChangeText={set('email')}
            error={fieldErrors.email}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            style={{ marginBottom: spacing.lg }}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            secure
            value={form.password}
            onChangeText={set('password')}
            error={fieldErrors.password}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            style={{ marginBottom: spacing.xl }}
          />

          <Button title="Sign in" onPress={onSubmit} loading={submitting} />

          <AppText variant="small" style={{ marginTop: spacing.xl, textAlign: 'center' }}>
            Forgot your password? Ask your brand to reset it.
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
