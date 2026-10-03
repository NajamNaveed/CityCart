import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { registerUrl, safeNext } from '../utils/nav'
import { btnPrimary } from '../ui'

export default function Login() {
  const { login } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '')

  const [form, setForm] = useState({ email: '', password: '' })
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
      // GuestRoute sends the visitor on to ?next= once the session exists.
      await login(form.email, form.password, 'customer')
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Customer sign in"
      title="Good to see you again."
      intro="Sign in to add to your cart, place orders and follow them to your door."
    >
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-sm text-muted">
        {next ? 'Sign in to pick up where you left off.' : 'Use the email you registered with.'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {error && (
          <p role="alert" className="border-l-2 border-clay bg-sand px-3 py-2 text-sm">
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
        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        New to CityCart?{' '}
        <Link to={next ? registerUrl(next) : '/register'} className="font-medium text-clay underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}