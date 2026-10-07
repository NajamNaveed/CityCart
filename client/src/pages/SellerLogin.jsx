import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { safeNext } from '../utils/nav'
import { btnPine } from '../ui'

export default function SellerLogin() {
  const { login } = useAuth()
  const [params] = useSearchParams()
  const hasNext = safeNext(params.get('next'), '') !== ''

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
      // GuestRoute sends the user on to their dashboard once the session exists.
      await login(form.email, form.password, 'brand')
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      tone="pine"
      eyebrow="Brand log in"
      title="Back to running your brand."
      intro="Owners and staff sign in here to manage products, stock and orders."
      points={['Brand owners and employees only', 'Shoppers sign in from the main store']}
    >
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">Brand log in</h1>
      <p className="mt-1.5 text-sm text-muted">
        {hasNext ? 'Log in to continue where you left off.' : 'Use the email you applied with, or the one your owner gave you.'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
            {error}
          </p>
        )}
        <Field label="Email" id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={onChange} error={fieldErrors.email} required />
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
        <button type="submit" disabled={submitting} className={`${btnPine} w-full`}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Don’t have a brand yet?{' '}
        <Link to="/sell/apply" className="font-medium text-pine underline-offset-4 hover:underline">
          Open your brand
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        Shopping instead?{' '}
        <Link to="/login" className="font-medium text-pine underline-offset-4 hover:underline">
          Customer sign in
        </Link>
      </p>
    </AuthShell>
  )
}