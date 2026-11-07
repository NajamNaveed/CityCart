import { useState } from 'react'
import api, { getErrorMessage } from '../services/api'
import { Button } from '../design'

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
      <Button tone="outline" size="sm" onClick={resend} disabled={state !== 'idle'}>
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Verification email sent' : 'Resend verification email'}
      </Button>
      {state === 'sent' && (
        <p className="mt-2 text-[11.5px] text-muted">Check your inbox and spam folder. Only the newest link works.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[11.5px] text-clay">
          {error}
        </p>
      )}
    </div>
  )
}
