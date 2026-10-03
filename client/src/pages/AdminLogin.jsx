import { useState } from 'react'
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
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5" noValidate>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">citycart. administration</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in</h1>
        </div>
        {error && (
          <p role="alert" className="border-l-2 border-clay bg-sand px-3 py-2 text-sm">
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
  )
}