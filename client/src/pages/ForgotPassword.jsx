import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { Button, Field, display, stateIcon, textLink } from '../design'
import { usePageMeta } from '../hooks/usePageMeta'
import api, { getErrorMessage } from '../services/api'

export default function ForgotPassword() {
  usePageMeta({ title: 'Reset your password', noindex: true })
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
          <span className={stateIcon}>
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className={`mt-4 ${display.sm}`}>Check your inbox</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
            If <span className="font-medium text-ink">{email.trim()}</span> belongs to a CityCart account, a reset link is
            on its way. It expires in 60 minutes.
          </p>
          <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
            <Link to={loginPath} className={textLink}>
              Back to sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className={display.sm}>Reset your password</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
            Enter the email on your account and we’ll send a recovery link.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
            {error && (
              <p role="alert" className="rounded-tile border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-clay">
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
            <Button type="submit" tone="noir" size="lg" disabled={submitting} className="w-full">
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>

          <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
            Remembered it?{' '}
            <Link to={loginPath} className={textLink}>
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
