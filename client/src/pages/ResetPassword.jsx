import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { Button, Field, display, stateIcon, stateIconOk, textLink } from '../design'
import api, { getErrorMessage } from '../services/api'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const requested = params.get('portal')
  const portal = requested === 'brand' || requested === 'service' ? requested : 'customer'
  const isBrand = portal === 'brand'
  const isService = portal === 'service'
  const loginPath = isService ? '/sell/service/login' : isBrand ? '/sell/login' : '/login'

  const [form, setForm] = useState({ newPassword: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const errors = {}
    if (form.newPassword.length < 8) errors.newPassword = 'Use at least 8 characters'
    if (form.confirm !== form.newPassword) errors.confirm = 'The two passwords do not match'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      await api.post('/auth/reset-password', { token, newPassword: form.newPassword })
      window.scrollTo({ top: 0 })
      setDone(true)
    } catch (err) {
      setFieldErrors(
        Object.fromEntries((err.response?.data?.errors || []).map((item) => [item.field, item.message])),
      )
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="New password, same account."
        intro="Every other signed-in device has been signed out for you."
      >
        <span className={stateIconOk}>
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className={`mt-4 ${display.sm}`}>Password changed</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink/55">Sign in with your new password to continue.</p>
        <Button to={loginPath} tone="noir" size="lg" className="mt-6 w-full">
          Go to sign in
        </Button>
      </AuthShell>
    )
  }

  if (!token) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="Links only, for safety."
        intro="A reset link is emailed to your inbox and works once, so nobody can reset a password by guessing."
      >
        <span className={stateIcon}>
          <XCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className={`mt-4 ${display.sm}`}>Open the link from your email</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
          Reset links expire after 60 minutes and work only once.
        </p>
        <Button to={`/forgot-password?portal=${portal}`} tone="noir" size="lg" className="mt-6 w-full">
          Request a new link
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Choose something only you know."
      intro="Pick a password you have not used for this CityCart account."
      points={['At least 8 characters', 'Used once, then discarded', 'Verifies your email too']}
    >
      <h1 className={display.sm}>Choose a new password</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
        This link is single-use. After saving, sign in with the new password.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-tile border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-clay">
            {error}
          </p>
        )}
        <Field
          label="New password"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.newPassword}
          onChange={onChange}
          error={fieldErrors.newPassword}
          required
        />
        <Field
          label="Confirm password"
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={onChange}
          error={fieldErrors.confirm}
          required
        />
        <Button type="submit" tone="noir" size="lg" disabled={submitting} className="w-full">
          {submitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>

      <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
        <Link to={`/forgot-password?portal=${portal}`} className={textLink}>
          Need a new link?
        </Link>
      </p>
    </AuthShell>
  )
}
