import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useCity } from '../../hooks/useCity'
import { Notice, PageHeader, StatusBadge, selectClass } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnDark, formatDateTime, humanize, inputClass } from '../../ui'

const SETTABLE = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']
const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

function Row({ label, children }) {
  if (!children) return null
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

export default function BrandDetail() {
  const { id } = useParams()
  const { cities } = useCity()
  const [state, setState] = useState({ id: null, data: null, error: '' })
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  // Termination form
  const [danger, setDanger] = useState(false)
  const [reason, setReason] = useState('')
  const [grace, setGrace] = useState('')
  const [typed, setTyped] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const fetchBrand = useCallback(
    () =>
      api.get(`/admin/brands/${id}`).then(
        (res) => ({ id, data: res.data, error: '' }),
        (err) => ({ id, data: null, error: getErrorMessage(err) }),
      ),
    [id],
  )

  useEffect(() => {
    let active = true
    fetchBrand().then((next) => {
      if (!active) return
      setState(next)
      if (next.data) setStatus(next.data.brand.status)
    })
    return () => {
      active = false
    }
  }, [fetchBrand])

  async function changeStatus() {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      await api.patch(`/brands/${id}/status`, { status })
      setMessage({ text: `Status changed to ${humanize(status).toLowerCase()}.`, tone: 'ok' })
      setState(await fetchBrand())
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  async function terminate(e) {
    e.preventDefault()
    setBusy(true)
    setFieldErrors({})
    setMessage({ text: '', tone: 'ok' })
    try {
      const res = await api.post(`/admin/brands/${id}/terminate`, {
        reason,
        ...(grace !== '' && { graceHours: Number(grace) }),
      })
      const { rejectedOrders, failedOrders, inTransitOrders } = res.data
      setMessage({
        text:
          `Brand terminated. ${rejectedOrders} unshipped order${rejectedOrders === 1 ? '' : 's'} rejected and restocked, ` +
          `${inTransitOrders} still on the way.` +
          (failedOrders?.length ? ` ${failedOrders.length} could not be rejected automatically; run the termination again to retry them.` : ''),
        tone: failedOrders?.length ? 'warn' : 'ok',
      })
      setDanger(false)
      setState(await fetchBrand())
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  if (state.id !== id)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  if (!state.data) {
    return (
      <>
        <p className="text-clay">{state.error}</p>
        <Link to="/admin/brands" className="mt-4 inline-block text-sm font-medium text-clay hover:underline">
          Back to brands
        </Link>
      </>
    )
  }

  const { brand, store, owners } = state.data
  const terminated = brand.status === 'TERMINATED'
  const cityName = cities.find((c) => c._id === brand.cityId)?.name

  return (
    <>
      <PageHeader
        title={brand.name}
        intro={`Joined ${formatDateTime(brand.createdAt)}`}
        action={
          <Link
            to="/admin/brands"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition hover:border-ink"
          >
            Back to brands
          </Link>
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Brand</h2>
            <dl className="divide-y divide-line text-sm">
              <Row label="Status">
                <StatusBadge value={brand.status} />
              </Row>
              <Row label="City">{cityName}</Row>
              <Row label="Address of the brand page">{brand.slug && `/${brand.slug}`}</Row>
              <Row label="Description">{brand.description}</Row>
            </dl>
          </section>

          {store && (
            <section className="rounded-lg border border-line bg-white p-6">
              <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">First store</h2>
              <dl className="divide-y divide-line text-sm">
                <Row label="Name">{store.name}</Row>
                <Row label="Address">{[store.address?.addressLine, store.address?.city].filter(Boolean).join(', ')}</Row>
                <Row label="Phone">{store.contact?.phone}</Row>
                <Row label="Open">{store.isActive ? 'Yes' : 'No'}</Row>
              </dl>
            </section>
          )}

          <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Owners</h2>
            {owners.length === 0 ? (
              <p className="py-3 text-sm text-muted">No owner accounts.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {owners.map((o) => (
                  <li key={o._id} className="flex flex-wrap justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium text-ink">{o.name}</span>
                      <span className="block text-muted">{o.email}</span>
                    </span>
                    <span className="text-muted">{o.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {terminated && (
            <section className="rounded-lg border border-danger/25 bg-danger-soft/40 p-6">
              <h2 className="border-b border-danger/25 pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-danger">
                Termination
              </h2>
              <dl className="divide-y divide-danger/15 text-sm">
                <Row label="Terminated">{formatDateTime(brand.terminatedAt)}</Row>
                <Row label="Staff access ends">{formatDateTime(brand.accessEndsAt)}</Row>
                <Row label="Reason">{brand.terminationReason}</Row>
              </dl>
            </section>
          )}
        </div>

        <aside className="space-y-6 text-sm">
          {!terminated && (
            <section className="rounded-lg border border-line bg-white p-6">
              <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Status</h2>
              <p className="mt-3 text-muted">Only active brands appear in the shop.</p>
              <label htmlFor="status" className="sr-only">
                New status
              </label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectClass} mt-3 w-full`}>
                {SETTABLE.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </select>
              <button type="button" disabled={busy || status === brand.status} onClick={changeStatus} className={`${btnDark} mt-3 w-full`}>
                Update status
              </button>
            </section>
          )}

          {!terminated && (
            <section className="rounded-lg border border-danger/30 bg-white p-6">
              <h2 className="border-b border-danger/25 pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-danger">
                Terminate brand
              </h2>
              {!danger ? (
                <>
                  <p className="mt-3 leading-relaxed text-muted">
                    Closes the brand permanently. Its unshipped orders are rejected and restocked, and its staff lose access after a
                    grace period. This cannot be undone.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDanger(true)}
                    className="mt-3 inline-flex h-10 items-center rounded-md border border-danger/40 bg-white px-4 text-[12.5px] font-medium text-danger transition hover:border-danger"
                  >
                    Start termination
                  </button>
                </>
              ) : (
                <form onSubmit={terminate} noValidate className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="reason" className={labelClass}>
                      Reason
                    </label>
                    <textarea
                      id="reason"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className={`${inputClass} py-3 ${fieldErrors.reason ? 'border-clay' : ''}`}
                      placeholder="At least 10 characters. Staff may see this."
                      required
                    />
                    {fieldErrors.reason && <p className="mt-1.5 text-xs text-clay">{fieldErrors.reason}</p>}
                  </div>
                  <div>
                    <label htmlFor="grace" className={labelClass}>
                      Staff access after termination (hours)
                    </label>
                    <input
                      id="grace"
                      type="number"
                      min="0"
                      max="168"
                      step="1"
                      value={grace}
                      onChange={(e) => setGrace(e.target.value)}
                      placeholder="Default 24; 0 cuts access now"
                      className={`h-10 ${inputClass}`}
                    />
                    {fieldErrors.graceHours && <p className="mt-1.5 text-xs text-clay">{fieldErrors.graceHours}</p>}
                  </div>
                  <div>
                    <label htmlFor="typed" className={labelClass}>
                      Type the brand name to confirm
                    </label>
                    <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={brand.name} className={`h-10 ${inputClass}`} autoComplete="off" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={busy || typed !== brand.name || reason.trim().length < 10}
                      className="inline-flex h-10 items-center rounded-md bg-danger px-5 text-[12px] font-medium uppercase tracking-[0.08em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Terminating…' : 'Terminate brand'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDanger(false)}
                      className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-[12.5px] font-medium text-ink transition hover:border-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  )
}