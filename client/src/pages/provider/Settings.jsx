import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Clock3, CreditCard, MapPin, Store } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import { Notice, PageHeader, StatusBadge } from '../../components/brand/Bits'
import { useAuth } from '../../hooks/useAuth'
import { btnPine } from '../../ui'

const LINKS = [
  { to: '/provider/profile', label: 'Profile and details', hint: 'Name, phone, starting price and bio', icon: Store },
  { to: '/provider/availability', label: 'Working hours', hint: 'Weekly hours and days off', icon: Clock3 },
  { to: '/provider/area', label: 'Service area', hint: 'The block you work in', icon: MapPin },
  { to: '/provider/billing', label: 'Billing', hint: 'Invoices and the 1% commission', icon: CreditCard },
]

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [fieldErrors, setFieldErrors] = useState({})

  const onChange = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage({ text: '', tone: 'ok' })
    setFieldErrors({})
    try {
      const { data } = await api.patch('/auth/password', form)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage({ text: data.message || 'Password changed.', tone: 'ok' })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6">
      <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">Password</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
        Choose a new password for signing in to your provider dashboard.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
        <Notice tone={message.tone}>{message.text}</Notice>
        <Field
          label="Current password"
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={onChange}
          error={fieldErrors.currentPassword}
          required
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="New password"
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.newPassword}
            onChange={onChange}
            error={fieldErrors.newPassword}
            hint="At least 8 characters."
            required
          />
          <Field
            label="Confirm new password"
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={form.confirmPassword}
            onChange={onChange}
            error={fieldErrors.confirmPassword}
            required
          />
        </div>
        <button type="submit" disabled={saving} className={btnPine}>
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  )
}

export default function ProviderSettings() {
  const { user } = useAuth()
  // The session user carries the provider id and status but not the public
  // slug, so the public-page link comes from the provider profile itself.
  const [slug, setSlug] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/me')
      .then(({ data }) => active && setSlug(data.provider?.slug || ''))
      .catch(() => {})
      .finally(() => active && setLoaded(true))
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageHeader
        title="Settings"
        intro="Your sign-in details, password and the settings that shape how customers book you."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <section className="rounded-card border border-line-warm bg-paper-warm p-5 sm:p-6">
            <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">Account</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
              This is the account you sign in with. Your public service name and phone live in your profile.
            </p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Name</dt>
                <dd className="mt-1 text-[14px] font-medium text-ink">{user?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Email</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-[14px] font-medium text-ink">
                  {user?.email || '—'}
                  <StatusBadge value={user?.emailVerified ? 'VERIFIED' : 'UNVERIFIED'} />
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Account type</dt>
                <dd className="mt-1 text-[14px] font-medium text-ink">Service provider</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Public page</dt>
                <dd className="mt-1 text-[14px] font-medium text-ink">
                  {slug ? (
                    <Link to={`/services/${slug}`} className="text-forest hover:underline">
                      /services/{slug}
                    </Link>
                  ) : loaded ? (
                    'Not published yet'
                  ) : (
                    'Loading…'
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-[12px] leading-relaxed text-ink/45">
              To change your sign-in name or email, contact CityCart support — those are tied to your application.
            </p>
          </section>

          <PasswordForm />
        </div>

        <aside className="space-y-4">
          <section className="rounded-card border border-line-warm bg-paper-warm p-5">
            <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink/45">Service settings</h2>
            <ul className="mt-3 space-y-1">
              {LINKS.map(({ to, label, hint, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className="-mx-2 flex items-start gap-3 rounded-tile px-2 py-2.5 transition hover:bg-canvas">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-tile bg-sand text-ink/60">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink">{label}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-ink/50">{hint}</span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink/25" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}
