import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import Field from '../components/Field'
import api, { getErrorMessage } from '../services/api'
import { btnPrimary } from '../ui'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const isBrand = params.get('portal') === 'brand'
  const loginPath = isBrand ? '/sell/login' : '/login'

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
        <CheckCircle2 className="h-10 w-10 text-pine" aria-hidden="true" />
        <h1 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">Password changed</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in with your new password to continue.</p>
        <Link to={loginPath} className={`${btnPrimary} mt-6 px-5`}>
          Go to sign in
        </Link>
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
        <XCircle className="h-10 w-10 text-clay" aria-hidden="true" />
        <h1 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">Open the link from your email</h1>
        <p className="mt-1.5 text-sm text-muted">Reset links expire after 60 minutes and work only once.</p>
        <Link to={`/forgot-password?portal=${isBrand ? 'brand' : 'customer'}`} className={`${btnPrimary} mt-6 px-5`}>
          Request a new link
        </Link>
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
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted">This link is single-use. After saving, sign in with the new password.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
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
        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link to={`/forgot-password?portal=${isBrand ? 'brand' : 'customer'}`} className="font-medium text-clay underline-offset-4 hover:underline">
          Need a new link?
        </Link>
      </p>
    </AuthShell>
  )
}
