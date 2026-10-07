import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Field from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { getErrorMessage, getFieldErrors } from '../services/api'
import { btnDark } from '../ui'

// Deliberately unlinked from every public page: reachable only by typing /admin/login.
// It also lives outside the shop and seller layouts, so it shows nothing but the form.
export default function AdminLogin() {
  const { login } = useAuth()
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
      await login(form.email, form.password, 'admin')
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-8 shadow-lg shadow-ink/5">
        <div className="mb-7">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            <ShieldCheck className="h-4 w-4 text-clay" aria-hidden="true" />
            citycart. administration
          </p>
          <h1 className="font-display mt-3 text-[28px] font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Platform staff only.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && (
            <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
              {error}
            </p>
          )}
          <Field label="Email" id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={onChange} error={fieldErrors.email} required />
          <Field label="Password" id="password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={onChange} error={fieldErrors.password} required />
          <button type="submit" disabled={submitting} className={`${btnDark} w-full`}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}