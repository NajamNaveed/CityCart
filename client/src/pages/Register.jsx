import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { Button, Field, display, stateIcon, textLink } from '../design'
import ResendVerification from '../components/ResendVerification'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { loginUrl, safeNext } from '../utils/nav'

export default function Register() {
  const { register } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '')

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      await register(form.name, form.email, form.password)
      window.scrollTo({ top: 0 })
      setSentTo(form.email.trim())
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        eyebrow="Verify your email"
        title="One click, and you’re in."
        intro="We verify every inbox before an account can order, so nobody signs up with someone else’s address."
      >
        <span className={stateIcon}>
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className={`mt-4 ${display.sm}`}>Check your inbox</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
          We sent a verification link to <span className="font-medium text-ink">{sentTo}</span>. Open it to activate your
          account, then sign in.
        </p>
        <div className="mt-5 rounded-tile border border-line-warm bg-canvas px-4 py-3 text-[12.5px] leading-relaxed text-ink/60">
          The link expires in 24 hours. If it doesn’t arrive within a few minutes, check spam or send it again.
        </div>
        <ResendVerification email={sentTo} portal="customer" className="mt-4" />
        <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
          Link already opened?{' '}
          <Link to={next ? loginUrl(next) : '/login'} className={textLink}>
            Sign in
          </Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Your city’s brands, one account."
      intro="Create your account, confirm your email, and start shopping with the brands around you."
    >
      <h1 className={display.sm}>Create your account</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
        For shoppers. Selling on CityCart uses a separate brand account.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-tile border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-clay">
            {error}
          </p>
        )}
        <Field label="Full name" id="name" name="name" autoComplete="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
        <Field label="Email" id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={onChange} error={fieldErrors.email} required />
        <Field
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
          required
        />
        <Button type="submit" tone="noir" size="lg" disabled={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
        Already registered?{' '}
        <Link to={next ? loginUrl(next) : '/login'} className={textLink}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
