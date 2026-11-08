import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { Button, Field, display, stateIcon, stateIconOk, textLink } from '../design'
import ResendVerification from '../components/ResendVerification'
import { usePageMeta } from '../hooks/usePageMeta'
import api, { getErrorMessage } from '../services/api'

export default function VerifyEmail() {
  usePageMeta({ title: 'Verify your email', noindex: true })
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const requested = params.get('portal')
  const portal = requested === 'brand' || requested === 'service' ? requested : 'customer'
  const isBrand = portal === 'brand'
  const isService = portal === 'service'
  const loginPath = isService ? '/sell/service/login' : isBrand ? '/sell/login' : '/login'
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
          <span className={stateIcon}>
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className={`mt-4 ${display.sm}`}>Verifying…</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">One moment while we confirm your link.</p>
        </>
      )}

      {state === 'done' && (
        <>
          <span className={stateIconOk}>
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className={`mt-4 ${display.sm}`}>Email verified</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
            {isService
              ? 'Your inbox is confirmed. CityCart will review your provider application and let you know when it is approved.'
              : isBrand
                ? 'Your account is active. Your shop is now visible to nearby shoppers.'
                : 'Your account is active. Sign in to start shopping.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button to={loginPath} tone="noir" size="lg">
              {isService ? 'Provider sign in' : isBrand ? 'Brand sign in' : 'Shopper sign in'}
            </Button>
            {(isBrand || isService) && (
              <Button to="/login" tone="outline" size="lg">
                Shopper sign in
              </Button>
            )}
          </div>
        </>
      )}

      {(state === 'failed' || state === 'missing') && (
        <>
          <span className={stateIcon}>
            <XCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className={`mt-4 ${display.sm}`}>
            {state === 'missing' ? 'This page needs a link' : 'That link did not work'}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/55">
            {state === 'missing'
              ? 'Open the verification link from your email, or request a new one below.'
              : `${error} Verification links work once and expire after 24 hours.`}
          </p>

          <div className="mt-6">
            <Field
              label="Your email"
              id="verify-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <ResendVerification email={email.trim()} portal={portal} className="mt-3" />
          <p className="mt-6 border-t border-line-warm pt-5 text-[13px] text-ink/55">
            <Link to={loginPath} className={textLink}>
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
