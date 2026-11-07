import { useState } from 'react'
import { Building2, ChevronLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import ResendVerification from '../components/ResendVerification'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { safeNext } from '../utils/nav'
import { Button, Field, display, textLink } from '../design'

const COPY = {
  brand: {
    eyebrow: 'Brand log in',
    title: 'Back to running your brand.',
    intro: 'Owners and staff sign in here to manage products, stock and orders.',
    points: ['Brand owners and employees only', 'Shoppers sign in from the main store'],
    heading: 'Brand log in',
    hint: 'Use the email you applied with, or the one your owner gave you.',
    signupLead: 'Don’t have a brand yet?',
    signupLabel: 'Open your brand',
    signupTo: '/sell/apply',
    loginPath: '/sell/login',
    otherLead: 'Offer a service instead?',
    otherLabel: 'Provider log in',
    otherTo: '/sell/service/login',
  },
  service: {
    eyebrow: 'Provider log in',
    title: 'Back to running your service.',
    intro: 'Service providers sign in here to manage their profile, area and bookings.',
    points: ['Service providers only', 'CityCart reviews every application', 'Cash or bank transfer, arranged with the customer'],
    heading: 'Provider log in',
    hint: 'Use the email you applied with.',
    signupLead: 'Want to offer a service?',
    signupLabel: 'Apply as a provider',
    signupTo: '/provider/apply',
    loginPath: '/sell/service/login',
    otherLead: 'Selling products instead?',
    otherLabel: 'Brand log in',
    otherTo: '/sell/login',
  },
}

export default function SellerLogin({ portal = 'brand' }) {
  const { login, chooseWorkspace } = useAuth()
  const [params] = useSearchParams()
  const hasNext = safeNext(params.get('next'), '') !== ''
  const copy = COPY[portal] || COPY.brand

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
      await login(form.email, form.password, portal)
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
    <AuthShell tone="pine" eyebrow={copy.eyebrow} title={copy.title} intro={copy.intro} points={copy.points}>
      {workspace ? (
        <div>
          <h1 className={display.sm}>Choose a workspace</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
            {form.email.trim()} is a team member at more than one brand. Pick the one you want to work in.
          </p>
          <ul className="mt-5 space-y-2.5">
            {workspace.memberships.map((m) => (
              <li key={m.brandId}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onChooseWorkspace(m.brandId)}
                  className="flex w-full items-center gap-3 rounded-tile border border-line-warm bg-paper-warm px-4 py-3.5 text-left transition hover:border-ink/30 disabled:opacity-60"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-sand text-clay">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{m.brandName}</span>
                    <span className="block text-[11.5px] text-ink/50">
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
            className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink/50 transition hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Use a different account
          </button>
        </div>
      ) : (
        <>
          <h1 className={display.sm}>{copy.heading}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
            {hasNext ? 'Log in to continue where you left off.' : copy.hint}
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-tile border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-clay">
              {error}
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
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
            <div className="-mt-1 flex justify-end">
              <Link to={`/forgot-password?portal=${portal}`} className={textLink}>
                Forgot password?
              </Link>
            </div>
            <Button type="submit" tone="noir" size="lg" disabled={submitting} className="w-full">
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>

          {needsVerification && <ResendVerification email={form.email.trim()} portal={portal} className="mt-4" />}
        </>
      )}

      <div className="mt-7 space-y-2 border-t border-line-warm pt-5 text-[12.5px] text-ink/55">
        <p>
          {copy.signupLead}{' '}
          <Link to={copy.signupTo} className={textLink}>
            {copy.signupLabel}
          </Link>
        </p>
        <p>
          {copy.otherLead}{' '}
          <Link to={copy.otherTo} className={textLink}>
            {copy.otherLabel}
          </Link>
        </p>
        <p>
          Shopping instead?{' '}
          <Link to="/login" className={textLink}>
            Customer sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
