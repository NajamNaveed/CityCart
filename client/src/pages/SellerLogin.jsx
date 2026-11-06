import { useState } from 'react'
import { Building2, ChevronLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import Field from '../components/Field'
import ResendVerification from '../components/ResendVerification'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { safeNext } from '../utils/nav'
import { btnPine } from '../ui'

export default function SellerLogin() {
  const { login, chooseWorkspace } = useAuth()
  const [params] = useSearchParams()
  const hasNext = safeNext(params.get('next'), '') !== ''

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [workspace, setWorkspace] = useState(null)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setNeedsVerification(false)
    setWorkspace(null)
    setSubmitting(true)
    try {
      // GuestRoute sends the user on to their dashboard once the session exists.
      await login(form.email, form.password, 'brand')
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'WORKSPACE_REQUIRED') {
        setWorkspace({ token: data.workspaceToken, memberships: data.memberships || [] })
      } else {
        setFieldErrors(getFieldErrors(err))
        setError(getErrorMessage(err))
        setNeedsVerification(data?.code === 'EMAIL_NOT_VERIFIED')
      }
      setSubmitting(false)
    }
  }

  async function onChooseWorkspace(brandId) {
    setError('')
    setSubmitting(true)
    try {
      await chooseWorkspace(workspace.token, brandId)
    } catch (err) {
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

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

      {workspace ? (
        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Choose a workspace</h2>
          <p className="mt-1.5 text-sm text-muted">
            {form.email.trim()} is a team member at more than one brand. Pick the one you want to work in.
          </p>
          <ul className="mt-5 space-y-2.5">
            {workspace.memberships.map((m) => (
              <li key={m.brandId}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onChooseWorkspace(m.brandId)}
                  className="flex w-full items-center gap-3 rounded-md border border-line bg-white px-4 py-3.5 text-left transition hover:border-pine disabled:opacity-60"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-pine/10 text-pine">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{m.brandName}</span>
                    <span className="block text-[12.5px] text-muted">
                      {m.role === 'PICKER' ? 'Picker' : 'Team member'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setWorkspace(null)}
            className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Use a different account
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
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
          <div className="flex justify-end">
            <Link to="/forgot-password?portal=brand" className="text-[13px] font-medium text-pine underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
          <button type="submit" disabled={submitting} className={`${btnPine} w-full`}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      )}

      {needsVerification && <ResendVerification email={form.email.trim()} portal="brand" className="mt-4" />}

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