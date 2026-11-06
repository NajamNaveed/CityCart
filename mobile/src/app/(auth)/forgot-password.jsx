import { useState } from 'react'
import { View } from 'react-native'
import { Link } from 'expo-router'
import AuthShell from '../../components/AuthShell'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import TextField from '../../components/ui/TextField'
import api, { getErrorMessage } from '../../services/api'
import { colors, radius, spacing } from '../../theme'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit() {
    if (submitting) return
    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError('Enter the email you registered with')
      return
    }
    setFieldError('')
    setError('')
    setSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { email: trimmed, portal: 'customer' })
      setSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={`If ${email.trim()} has an account, a recovery link is on its way.`}>
        <View
          style={{
            backgroundColor: colors.successSoft,
            borderRadius: radius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}
        >
          <AppText variant="small" style={{ color: colors.success }}>
            Open the link in your browser to choose a new password. It works once and expires after 60 minutes.
          </AppText>
        </View>
        <Link href="/login" replace>
          <AppText variant="label" style={{ color: colors.clay, textAlign: 'center' }}>
            Back to sign in
          </AppText>
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your account and we’ll send a single-use recovery link."
    >
      {error ? (
        <View
          accessibilityRole="alert"
          style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}
        >
          <AppText variant="small" style={{ color: colors.danger }}>
            {error}
          </AppText>
        </View>
      ) : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldError}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        style={{ marginBottom: spacing.xl }}
      />

      <Button title="Send recovery link" onPress={onSubmit} loading={submitting} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.xs }}>
        <AppText variant="small">Remembered it?</AppText>
        <Link href="/login" replace>
          <AppText variant="label" style={{ color: colors.clay }}>
            Sign in
          </AppText>
        </Link>
      </View>
    </AuthShell>
  )
}
