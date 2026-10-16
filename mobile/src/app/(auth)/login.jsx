import { useRef, useState } from 'react'
import { View } from 'react-native'
import { Link, Redirect, useLocalSearchParams } from 'expo-router'
import AuthShell from '../../components/AuthShell'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { useAuth } from '../../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../../services/api'
import { registerHref, safeNext } from '../../utils/nav'
import { sentenceAll, validateLogin } from '../../utils/validation'
import { colors, radius, spacing } from '../../theme'

export default function Login() {
  const { status, login } = useAuth()
  const { next: rawNext } = useLocalSearchParams()
  const next = safeNext(rawNext, '')

  const passwordRef = useRef(null)
  const [form, setForm] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Signing in flips `status`; this one redirect then takes the shopper back to
  // where they were going (or to their account), whether they just signed in or
  // arrived here already signed in.
  if (status === 'signedIn') return <Redirect href={next || '/account'} />

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
      setFieldErrors(sentenceAll(getFieldErrors(err)))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Sign in" subtitle={next ? 'Sign in to pick up where you left off.' : 'Use the email you registered with.'}>
      {error ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}
        >
          <AppText variant="small" style={{ color: colors.danger }}>
            {error}
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

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.xs }}>
        <AppText variant="small">New to CityCart?</AppText>
        <Link href={registerHref(next)} replace>
          <AppText variant="label" style={{ color: colors.clay }}>
            Create an account
          </AppText>
        </Link>
      </View>
    </AuthShell>
  )
}
