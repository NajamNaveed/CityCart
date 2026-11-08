import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { Button, Field, display, textLink } from '../design'
import ResendVerification from '../components/ResendVerification'
import { useAuth } from '../hooks/useAuth'
import { usePageMeta } from '../hooks/usePageMeta'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { registerUrl, safeNext } from '../utils/nav'

export default function Login() {
  usePageMeta({ title: 'Sign in', noindex: true })
  const { login } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '')

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setNeedsVerification(false)
    setSubmitting(true)
    try {
      // GuestRoute sends the visitor on to ?next= once the session exists.
      await login(form.email, form.password, 'customer')
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setNeedsVerification(err.response?.data?.code === 'EMAIL_NOT_VERIFIED')
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Customer sign in"
      title="Good to see you again."
      intro="Sign in to add to your cart, place orders and follow them to your door."
    >
      <h1 className={display.sm}>Sign in</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
        {next ? 'Sign in to pick up where you left off.' : 'Use the email you registered with.'}
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-tile border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-clay">
            {error}
          </p>
        )}
        <Field
          label="Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={onChange}
          error={fieldErrors.email}
          required
        />
        <Field
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
          required
        />
        <div className="flex justify-end">
          <Link to="/forgot-password?portal=customer" className={`text-[12.5px] ${textLink}`}>
            Forgot password?
          </Link>
        </div>
        <Button type="submit" tone="noir" size="lg" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {needsVerification && <ResendVerification email={form.email.trim()} portal="customer" className="mt-4" />}

      <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
        New to CityCart?{' '}
        <Link to={next ? registerUrl(next) : '/register'} className={textLink}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
