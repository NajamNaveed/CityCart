import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import Field from '../../components/Field'
import { toast } from '../../components/ui'
import { btnDark } from '../../ui'

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

/**
 * Shown instead of the dashboard until a partner replaces the temporary
 * password the super admin gave them (docs/21 §G.2). The server refuses all
 * other admin calls until this succeeds, so it cannot be skipped.
 */
export default function ChangePassword() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      await api.patch('/auth/password', form)
      await refresh()
      toast('Password changed. Welcome to CityCart.', { type: 'success' })
      // The requested URL may be outside this partner's areas; the landing
      // page sends them to the first area they can actually open.
      navigate('/admin', { replace: true })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-line bg-white p-8 shadow-lg shadow-ink/5">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        <KeyRound className="h-4 w-4 text-clay" aria-hidden="true" />
        first sign-in
      </p>
      <h1 className="font-display mt-3 text-[26px] font-semibold tracking-tight text-ink">Choose your password</h1>
      <p className="mt-1.5 text-sm text-muted">
        Your temporary password stops working once you set your own. Use at least 8 characters.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
            {error}
          </p>
        )}
        <Field
          label="Temporary password"
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={onChange}
          error={fieldErrors.currentPassword}
          required
        />
        <Field
          label="New password"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={onChange}
          error={fieldErrors.newPassword}
          required
        />
        <Field
          label="Confirm new password"
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={onChange}
          error={fieldErrors.confirmPassword}
          required
        />
        <button type="submit" disabled={submitting} className={`${btnDark} w-full`}>
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}
