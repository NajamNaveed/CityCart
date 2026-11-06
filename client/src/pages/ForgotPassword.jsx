import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import Field from '../components/Field'
import api, { getErrorMessage } from '../services/api'
import { btnPrimary } from '../ui'

export default function ForgotPassword() {
  const [params] = useSearchParams()
  const requested = params.get('portal')
  const portal = requested === 'brand' || requested === 'service' ? requested : 'customer'
  const isBrand = portal === 'brand'
  const isService = portal === 'service'

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldError('')
    if (!email.trim()) {
      setFieldError('Enter the email you signed up with')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim(), portal })
      window.scrollTo({ top: 0 })
      setSent(true)
    } catch (err) {
      const field = err.response?.data?.errors?.[0]
      setFieldError(field?.message || '')
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const loginPath = isService ? '/sell/service/login' : isBrand ? '/sell/login' : '/login'

  return (
    <AuthShell
      tone={isBrand ? 'pine' : 'sand'}
      eyebrow={isService ? 'Provider password recovery' : isBrand ? 'Brand password recovery' : 'Password recovery'}
      title="Forgot it? It happens."
      intro="We email a single-use link that lets you choose a new password. Nobody at CityCart can see your password."
      points={['Link expires in 60 minutes', 'Works once', 'Signs out other sessions']}
    >
      {sent ? (
        <>
          <MailCheck className="h-10 w-10 text-pine" aria-hidden="true" />
          <h1 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">Check your inbox</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            If <span className="font-medium text-ink">{email.trim()}</span> belongs to a CityCart account, a reset link is
            on its way. It expires in 60 minutes.
          </p>
          <p className="mt-6 text-sm text-muted">
            <Link to={loginPath} className="font-medium text-clay underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted">Enter the email on your account and we’ll send a recovery link.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            {error && (
              <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
                {error}
              </p>
            )}
            <Field
              label="Email"
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldError}
              required
            />
            <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted">
            Remembered it?{' '}
            <Link to={loginPath} className="font-medium text-clay underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
