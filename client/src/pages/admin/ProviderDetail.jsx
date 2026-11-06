import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader, StatusBadge } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnDark, formatDateTime, formatPrice, humanize, inputClass } from '../../ui'

// Mirrors PROVIDER_STATUS_TRANSITIONS in server/src/config/serviceProviderStatuses.js.
const NEXT = {
  PENDING: [
    { status: 'ACTIVE', label: 'Approve provider', text: 'Approves the application and lists the provider for customers in its block.' },
    { status: 'SUSPENDED', label: 'Refuse application', text: 'Refuses the application. The owner is told and the profile stays hidden.' },
  ],
  ACTIVE: [
    { status: 'SUSPENDED', label: 'Suspend provider', text: 'Hides the provider from customers until it is reinstated.' },
    { status: 'TERMINATED', label: 'Terminate provider', text: 'Permanently removes the provider. The record and its history stay.' },
  ],
  SUSPENDED: [
    { status: 'ACTIVE', label: 'Reinstate provider', text: 'Lifts the suspension and lists the provider again.' },
    { status: 'TERMINATED', label: 'Terminate provider', text: 'Permanently removes the provider. This cannot be undone.' },
  ],
  TERMINATED: [],
}

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'
const money = (paisa) => formatPrice((paisa ?? 0) / 100)

function Row({ label, children }) {
  if (!children) return null
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[65%] text-right">{children}</dd>
    </div>
  )
}

export default function ProviderDetail() {
  const { id } = useParams()
  const [state, setState] = useState({ id: null, data: null, error: '' })
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState('')
  const [reason, setReason] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const fetchProvider = useCallback(
    () =>
      api.get(`/admin/providers/${id}`).then(
        (res) => ({ id, data: res.data, error: '' }),
        (err) => ({ id, data: null, error: getErrorMessage(err) }),
      ),
    [id],
  )

  useEffect(() => {
    let active = true
    fetchProvider().then((next) => active && setState(next))
    return () => {
      active = false
    }
  }, [fetchProvider])

  const provider = state.data?.provider
  const actions = provider ? NEXT[provider.status] || [] : []
  const action = actions.find((a) => a.status === chosen) || null
  const needsReason = Boolean(action && action.status !== 'ACTIVE')

  async function submitStatus(e) {
    e.preventDefault()
    if (!action) return
    setBusy(true)
    setFieldErrors({})
    setMessage({ text: '', tone: 'ok' })
    try {
      const res = await api.patch(`/admin/providers/${id}/status`, {
        status: action.status,
        ...(reason.trim() && { reason: reason.trim() }),
      })
      setMessage({ text: res.data.message, tone: 'ok' })
      setChosen('')
      setReason('')
      setState(await fetchProvider())
    } catch (err) {
      setFieldErrors({ reason: err.response?.data?.errors?.find((item) => item.field === 'reason')?.message || '' })
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  if (state.id !== id) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (!state.data) {
    return (
      <>
        <p className="text-clay">{state.error}</p>
        <Link to="/admin/providers" className="mt-4 inline-block text-sm font-medium text-clay hover:underline">
          Back to providers
        </Link>
      </>
    )
  }

  const { owner } = state.data

  return (
    <>
      <PageHeader
        title={provider.displayName}
        intro={`Applied ${formatDateTime(provider.createdAt)}`}
        action={
          <Link
            to="/admin/providers"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition hover:border-ink"
          >
            Back to providers
          </Link>
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Provider</h2>
            <dl className="divide-y divide-line text-sm">
              <Row label="Status">
                <StatusBadge value={provider.status} />
              </Row>
              <Row label="Verification">
                <StatusBadge value={provider.verification} />
              </Row>
              <Row label="Service">{provider.category?.name}</Row>
              <Row label="Starting price">{money(provider.startingAtPrice)}</Row>
              <Row label="City">{provider.city?.name}</Row>
              <Row label="Block">{provider.block?.name}</Row>
              <Row label="Address">{provider.addressLine}</Row>
              <Row label="Phone">{provider.phone}</Row>
              <Row label="Public link">{provider.slug && `/${provider.slug}`}</Row>
              <Row label="About">{provider.bio}</Row>
              <Row label="Approved">{provider.approvedAt ? formatDateTime(provider.approvedAt) : ''}</Row>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Owner</h2>
            {owner ? (
              <dl className="divide-y divide-line text-sm">
                <Row label="Name">{owner.name}</Row>
                <Row label="Email">{owner.email}</Row>
                <Row label="Email verified">{owner.emailVerified ? 'Yes' : 'No'}</Row>
                <Row label="Phone">{owner.phone}</Row>
                <Row label="Account active">{owner.isActive ? 'Yes' : 'No'}</Row>
              </dl>
            ) : (
              <p className="py-3 text-sm text-muted">No owner account.</p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Activity</h2>
            <dl className="divide-y divide-line text-sm">
              <Row label="Completed jobs">{provider.completedBookings}</Row>
              <Row label="Rating">
                {provider.ratingCount > 0 ? `${provider.ratingAvg.toFixed(1)} from ${provider.ratingCount} reviews` : 'No reviews yet'}
              </Row>
              <Row label="Billing">{humanize(provider.billingStatus)}</Row>
              <Row label="Last block change">{provider.blockChangedAt ? formatDateTime(provider.blockChangedAt) : 'Never'}</Row>
            </dl>
          </section>
        </div>

        <aside className="space-y-6 text-sm">
          {actions.length === 0 ? (
            <section className="rounded-lg border border-line bg-white p-6">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Status</h2>
              <p className="mt-3 leading-relaxed text-muted">A terminated provider cannot be changed.</p>
            </section>
          ) : (
            <section className="rounded-lg border border-line bg-white p-6">
              <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Status actions
              </h2>
              <div className="mt-4 space-y-2">
                {actions.map((a) => (
                  <button
                    key={a.status}
                    type="button"
                    onClick={() => {
                      setChosen(a.status)
                      setReason('')
                      setFieldErrors({})
                      setMessage({ text: '', tone: 'ok' })
                    }}
                    className={`w-full rounded-md border px-3.5 py-3 text-left transition ${
                      chosen === a.status ? 'border-ink bg-paper' : 'border-line bg-white hover:border-ink'
                    }`}
                  >
                    <span className={`block font-medium ${a.status === 'SUSPENDED' || a.status === 'TERMINATED' ? 'text-clay' : 'text-ink'}`}>
                      {a.label}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{a.text}</span>
                  </button>
                ))}
              </div>

              {action && (
                <form onSubmit={submitStatus} className="mt-4 border-t border-line pt-4">
                  {needsReason && (
                    <div>
                      <label htmlFor="reason" className={labelClass}>
                        Reason
                      </label>
                      <textarea
                        id="reason"
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="At least 5 characters. The provider may see this."
                        className={`${inputClass} py-3 ${fieldErrors.reason ? 'border-clay' : ''}`}
                        required
                      />
                      {fieldErrors.reason && <p className="mt-1.5 text-xs text-clay">{fieldErrors.reason}</p>}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={busy || (needsReason && reason.trim().length < 5)}
                    className={`${btnDark} mt-3 w-full`}
                  >
                    {busy ? 'Saving…' : action.label}
                  </button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
