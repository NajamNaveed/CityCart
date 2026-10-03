import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { loginUrl, safeNext } from '../utils/nav'
import { btnPrimary } from '../ui'

export default function Register() {
  const { register } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '')

  const [form, setForm] = useState({ name: '', email: '', password: '' })
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
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Your city’s brands, one account."
      intro="Registering takes a minute. You will come straight back to what you were looking at."
    >
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">For shoppers. Selling on CityCart uses a separate brand account.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {error && (
          <p role="alert" className="border-l-2 border-clay bg-sand px-3 py-2 text-sm">
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
        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already registered?{' '}
        <Link to={next ? loginUrl(next) : '/login'} className="font-medium text-clay underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}