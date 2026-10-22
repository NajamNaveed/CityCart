import { useEffect, useState } from 'react'
import { Bike, Plus } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useCan } from '../../hooks/useCan'
import Field from '../../components/Field'
import { Notice, PageHeader, Pager, StatusBadge } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { btnPine } from '../../ui'

const EMPTY = { name: '', email: '', phone: '', password: '' }

const ghostBtn =
  'rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink disabled:opacity-50'

export default function Riders() {
  const can = useCan()
  const [riders, setRiders] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})

  const [resetting, setResetting] = useState(null) // { id, password }
  const [confirmOff, setConfirmOff] = useState(null) // rider id

  useEffect(() => {
    let active = true
    api
      .get('/riders', { params: { limit: 10, page } })
      .then((res) => {
        if (!active) return
        setRiders(res.data.riders)
        setPagination(res.data.pagination)
      })
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [reload, page])

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function run(action, success) {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      await action()
      setMessage({ text: success, tone: 'ok' })
      setReload((n) => n + 1)
      return true
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onAdd(e) {
    e.preventDefault()
    setFieldErrors({})
    const ok = await run(
      () => api.post('/riders', { name: form.name, email: form.email, phone: form.phone, password: form.password }),
      'Rider added. Give them their email and password; they sign in on the CityCart Partner app.',
    )
    if (ok) {
      setForm(EMPTY)
      setAdding(false)
    }
  }

  async function onReset(e) {
    e.preventDefault()
    setFieldErrors({})
    const ok = await run(
      () => api.patch(`/riders/${resetting.id}/password`, { password: resetting.password }),
      'Password changed. The rider has been signed out everywhere and must sign in with the new one.',
    )
    if (ok) setResetting(null)
  }

  const setActive = (rider, isActive) =>
    run(
      () => api.patch(`/riders/${rider._id}`, { isActive }),
      isActive ? 'Rider reactivated.' : 'Rider deactivated. They can no longer sign in. Move their open deliveries to someone else.',
    ).then(() => setConfirmOff(null))

  return (
    <>
      <PageHeader
        title="Riders"
        intro="The people who deliver your orders. Each rider sees only the deliveries you give them."
        action={
          can('riders.create') && (
            <button type="button" onClick={() => setAdding((v) => !v)} className={btnPine}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {adding ? 'Close' : 'Add rider'}
            </button>
          )
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      {adding && (
        <form onSubmit={onAdd} noValidate className="mb-8 space-y-7 rounded-lg border border-line bg-white p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" id="r-name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
            <Field label="Phone" id="r-phone" name="phone" type="tel" value={form.phone} onChange={onChange} error={fieldErrors.phone} hint="Customers may need to reach them." required />
            <Field label="Email" id="r-email" name="email" type="email" value={form.email} onChange={onChange} error={fieldErrors.email} required />
            <Field label="Password" id="r-password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={onChange} error={fieldErrors.password} required />
          </div>
          <button type="submit" disabled={busy} className={btnPine}>
            {busy ? 'Adding…' : 'Add rider'}
          </button>
        </form>
      )}

      {loadError ? (
        <p className="text-clay">{loadError}</p>
      ) : !riders ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : riders.length === 0 ? (
        <EmptyState
          icon={Bike}
          title="No riders yet."
          message="Add a rider, then give them deliveries from the Deliveries page."
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <>
          <ul className="space-y-3">
            {riders.map((r) => (
              <li key={r._id} className="rounded-lg border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-[13px] text-muted">{r.email}</p>
                    <p className="text-[13px] text-muted">{r.phone}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-medium">
                    <StatusBadge value={r.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    {can('riders.update') && (
                      <button
                        type="button"
                        onClick={() => setResetting(resetting?.id === r._id ? null : { id: r._id, password: '' })}
                        className={ghostBtn}
                      >
                        {resetting?.id === r._id ? 'Close' : 'Reset password'}
                      </button>
                    )}
                    {r.isActive && can('riders.update') &&
                      (confirmOff === r._id ? (
                        <span className="flex items-center gap-2.5 rounded-md bg-danger-soft px-3 py-1.5 font-normal text-danger">
                          Deactivate?
                          <button type="button" disabled={busy} onClick={() => setActive(r, false)} className="font-semibold hover:underline">
                            Yes
                          </button>
                          <button type="button" onClick={() => setConfirmOff(null)} className="text-muted hover:text-ink">
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmOff(r._id)}
                          className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger"
                        >
                          Deactivate
                        </button>
                      ))}
                    {!r.isActive && can('riders.update') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setActive(r, true)}
                        className="rounded-md border border-pine px-3 py-1.5 text-pine transition hover:bg-pine hover:text-white"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>

                {resetting?.id === r._id && (
                  <form onSubmit={onReset} noValidate className="mt-5 flex flex-wrap items-end gap-3 rounded-md border border-line bg-paper p-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <Field
                        label="New password"
                        id={`reset-${r._id}`}
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={resetting.password}
                        onChange={(e) => setResetting({ id: r._id, password: e.target.value })}
                        error={fieldErrors.password}
                        required
                      />
                    </div>
                    <button type="submit" disabled={busy || resetting.password.length < 8} className={btnPine}>
                      {busy ? 'Saving…' : 'Change password'}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <Pager pagination={pagination} onPage={setPage} />
        </>
      )}
    </>
  )
}
