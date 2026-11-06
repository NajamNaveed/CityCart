import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import ResendVerification from '../components/ResendVerification'
import api, { getErrorMessage } from '../services/api'
import { btnPrimary } from '../ui'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const portal = params.get('portal') === 'brand' ? 'brand' : 'customer'
  const isBrand = portal === 'brand'
  const [state, setState] = useState(token ? 'checking' : 'missing')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const started = useRef(false)

  useEffect(() => {
    // React's development double-invoke must not spend the single-use token twice.
    if (started.current) return
    started.current = true
    if (!token) return

    api
      .post('/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((err) => {
        setError(getErrorMessage(err))
        setState('failed')
      })
  }, [token])

  return (
    <AuthShell
      eyebrow="Email verification"
      title="Confirming your inbox."
      intro="Verification keeps accounts tied to the person who owns the email address."
    >
      {state === 'checking' && (
        <>
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">Verifying…</h1>
          <p className="mt-1.5 text-sm text-muted">One moment while we confirm your link.</p>
        </>
      )}

      {state === 'done' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-pine" aria-hidden="true" />
          <h1 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">Email verified</h1>
          <p className="mt-1.5 text-sm text-muted">
            Your account is active. Brand owners: your shop is now visible to nearby shoppers.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={isBrand ? '/sell/login' : '/login'} className={`${btnPrimary} px-5`}>
              {isBrand ? 'Brand sign in' : 'Shopper sign in'}
            </Link>
            {isBrand && (
              <Link
                to="/login"
                className="inline-flex h-11 items-center rounded-md border border-line bg-white px-5 text-[13px] font-medium text-ink transition hover:border-ink"
              >
                Shopper sign in
              </Link>
            )}
          </div>
        </>
      )}

      {(state === 'failed' || state === 'missing') && (
        <>
          <XCircle className="h-10 w-10 text-clay" aria-hidden="true" />
          <h1 className="font-display mt-4 text-[28px] font-semibold tracking-tight text-ink">
            {state === 'missing' ? 'This page needs a link' : 'That link did not work'}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {state === 'missing'
              ? 'Open the verification link from your email, or request a new one below.'
              : `${error} Verification links work once and expire after 24 hours.`}
          </p>

          <label htmlFor="verify-email" className="mt-6 mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            Your email
          </label>
          <input
            id="verify-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 w-full rounded-md border border-line bg-white px-3.5 text-sm text-ink outline-none focus:border-ink"
          />
          <ResendVerification email={email.trim()} portal={portal} className="mt-3" />
          <p className="mt-6 text-sm text-muted">
            <Link to={isBrand ? '/sell/login' : '/login'} className="font-medium text-clay underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
