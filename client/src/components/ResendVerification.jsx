import { useState } from 'react'
import api, { getErrorMessage } from '../services/api'

/**
 * "Didn't get it?" control shown after sign-up and when an unverified
 * account tries to sign in. The server always answers the same way, so this
 * cannot be used to discover whether an address has an account.
 */
export default function ResendVerification({ email, portal = 'customer', className = '' }) {
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState('')

  async function resend() {
    setState('sending')
    setError('')
    try {
      await api.post('/auth/verify-email/resend', { email, portal })
      setState('sent')
    } catch (err) {
      setError(getErrorMessage(err))
      setState('idle')
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={resend}
        disabled={state !== 'idle'}
        className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-[13px] font-medium text-ink transition hover:border-ink disabled:cursor-default disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Verification email sent' : 'Resend verification email'}
      </button>
      {state === 'sent' && (
        <p className="mt-2 text-xs text-muted">Check your inbox and spam folder. Only the newest link works.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-clay">
          {error}
        </p>
      )}
    </div>
  )
}
