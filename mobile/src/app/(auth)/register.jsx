import { useRef, useState } from 'react'
import { View } from 'react-native'
import { Link, Redirect, useLocalSearchParams } from 'expo-router'
import AuthShell from '../../components/AuthShell'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import { useAuth } from '../../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../../services/api'
import { loginHref, safeNext } from '../../utils/nav'
import { MIN_PASSWORD_LENGTH, sentenceAll, validateRegister } from '../../utils/validation'
import { colors, radius, spacing } from '../../theme'

export default function Register() {
  const { status, register } = useAuth()
  const { next: rawNext } = useLocalSearchParams()
  const next = safeNext(rawNext, '')

  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // See login.jsx: signing up flips `status`, and this redirect does the rest.
  if (status === 'signedIn') return <Redirect href={next || '/account'} />

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  async function onSubmit() {
    if (submitting) return
    const problems = validateRegister(form)
    setFieldErrors(problems)
    setError('')
    if (Object.keys(problems).length > 0) return

    setSubmitting(true)
    try {
      await register({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password })
    } catch (err) {
      setFieldErrors(sentenceAll(getFieldErrors(err)))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="For shoppers. Selling on CityCart uses a separate brand account on the website.">
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
        label="Full name"
        value={form.name}
        onChangeText={set('name')}
        error={fieldErrors.name}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        style={{ marginBottom: spacing.lg }}
      />
      <TextField
        ref={emailRef}
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
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        style={{ marginBottom: spacing.xl }}
      />

      <Button title="Create account" onPress={onSubmit} loading={submitting} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.xs }}>
        <AppText variant="small">Already registered?</AppText>
        <Link href={loginHref(next)} replace>
          <AppText variant="label" style={{ color: colors.clay }}>
            Sign in
          </AppText>
        </Link>
      </View>
    </AuthShell>
  )
}
