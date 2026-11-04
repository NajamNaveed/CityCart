import { useEffect, useState } from 'react'
import { Plus, UserRound } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { useCan } from '../../hooks/useCan'
import Field from '../../components/Field'
import PermissionPicker from '../../components/brand/PermissionPicker'
import { Notice, PageHeader, Pager, StatusBadge } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { btnPine } from '../../ui'

const EMPTY = { name: '', email: '', password: '', phone: '', jobTitle: '', role: 'BRAND_EMPLOYEE' }

export default function Team() {
  const can = useCan()
  const [members, setMembers] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [busy, setBusy] = useState(false)

  // Add form
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [permissions, setPermissions] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})

  // Edit access
  const [editing, setEditing] = useState(null) // { id, permissions }
  const [confirmOff, setConfirmOff] = useState(null) // member id

  useEffect(() => {
    let active = true
    api
      .get('/employees', { params: { limit: 10, page } })
      .then((res) => {
        if (!active) return
        setMembers(res.data.employees)
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
      () =>
        api.post('/employees', {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          ...(form.role === 'BRAND_EMPLOYEE' && { permissions }),
          ...(form.phone.trim() && { phone: form.phone }),
          ...(form.jobTitle.trim() && { jobTitle: form.jobTitle }),
        }),
      form.role === 'PICKER'
        ? 'Picker added. Give them their email and password; they sign in on the CityCart Partner app.'
        : 'Team member added. Give them their email and password; they sign in on the brand log in page.',
    )
    if (ok) {
      setForm(EMPTY)
      setPermissions([])
      setAdding(false)
    }
  }

  async function saveAccess(e) {
    e.preventDefault()
    const ok = await run(
      () => api.patch(`/employees/${editing.id}/permissions`, { permissions: editing.permissions }),
      'Access updated.',
    )
    if (ok) setEditing(null)
  }

  const setActive = (member, isActive) =>
    run(
      () => api.patch(`/employees/${member._id}`, { isActive }),
      isActive ? 'Team member reactivated.' : 'Team member deactivated. They can no longer sign in.',
    ).then(() => setConfirmOff(null))

  return (
    <>
      <PageHeader
        title="Team"
        intro="People who work on your brand, and exactly what each of them can do."
        action={
          can('employees.create') && (
            <button type="button" onClick={() => setAdding((v) => !v)} className={btnPine}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {adding ? 'Close' : 'Add team member'}
            </button>
          )
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      {adding && (
        <form onSubmit={onAdd} noValidate className="mb-8 space-y-7 rounded-lg border border-line bg-white p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" id="m-name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
            <Field label="Job title" id="m-title" name="jobTitle" value={form.jobTitle} onChange={onChange} error={fieldErrors.jobTitle} hint="Optional, e.g. Order packer." />
            <Field label="Email" id="m-email" name="email" type="email" value={form.email} onChange={onChange} error={fieldErrors.email} required />
            <Field label="Phone" id="m-phone" name="phone" type="tel" value={form.phone} onChange={onChange} error={fieldErrors.phone} hint="Optional." />
            <Field label="Password" id="m-password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={onChange} error={fieldErrors.password} required />
          </div>
          <div>
            <h2 className="mb-1 text-[15px] font-semibold text-ink">What kind of account?</h2>
            <p className="mb-3 text-[13px] text-muted">
              A team member uses the website and gets only the permissions you tick. A picker uses the Partner app and sees only the orders waiting to be picked.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ['BRAND_EMPLOYEE', 'Team member'],
                ['PICKER', 'Picker'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: value }))}
                  aria-pressed={form.role === value}
                  className={`rounded-md border px-4 py-2 text-[13px] font-medium transition ${
                    form.role === value ? 'border-pine bg-pine text-white' : 'border-line bg-white text-ink hover:border-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {form.role === 'BRAND_EMPLOYEE' ? (
            <div>
              <h2 className="mb-1 text-[15px] font-semibold text-ink">What can they do?</h2>
              <p className="mb-5 text-[13px] text-muted">They only get what you tick. You can change this later.</p>
              <PermissionPicker value={permissions} onChange={setPermissions} canGrant={can} />
              {fieldErrors.permissions && <p className="mt-3 text-xs text-clay">{fieldErrors.permissions}</p>}
            </div>
          ) : (
            <p className="rounded-md border border-line bg-paper px-4 py-3 text-[13px] text-muted">
              A picker signs in on the CityCart Partner app. They see the customer’s first name and the items only — never the phone number, prices or payment.
            </p>
          )}
          <button type="submit" disabled={busy} className={btnPine}>
            {busy ? 'Adding…' : form.role === 'PICKER' ? 'Add picker' : 'Add team member'}
          </button>
        </form>
      )}

      {loadError ? (
        <p className="text-clay">{loadError}</p>
      ) : !members ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No team members yet."
          message="Add someone to help with orders, products or deliveries."
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <>
          <ul className="space-y-3">
          {members.map((m) => (
            <li key={m._id} className="rounded-lg border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink">
                    {m.user?.name}
                    {m.jobTitle && <span className="ml-2 text-sm font-normal text-muted">{m.jobTitle}</span>}
                  </p>
                  <p className="text-[13px] text-muted">{m.user?.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    {m.user?.role === 'PICKER'
                      ? 'Picker · Partner app only'
                      : m.permissions.length === 0
                        ? 'Cannot do anything yet'
                        : `${m.permissions.length} permission${m.permissions.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-medium">
                  <StatusBadge value={m.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  {can('employees.manage_permissions') && m.user?.role !== 'PICKER' && (
                    <button
                      type="button"
                      onClick={() => setEditing(editing?.id === m._id ? null : { id: m._id, permissions: m.permissions })}
                      className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink"
                    >
                      {editing?.id === m._id ? 'Close' : 'Edit access'}
                    </button>
                  )}
                  {m.isActive && can('employees.delete') && (
                    confirmOff === m._id ? (
                      <span className="flex items-center gap-2.5 rounded-md bg-danger-soft px-3 py-1.5 font-normal text-danger">
                        Deactivate?
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setActive(m, false)}
                          className="font-semibold hover:underline"
                        >
                          Yes
                        </button>
                        <button type="button" onClick={() => setConfirmOff(null)} className="text-muted hover:text-ink">
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmOff(m._id)}
                        className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger"
                      >
                        Deactivate
                      </button>
                    )
                  )}
                  {!m.isActive && can('employees.update') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setActive(m, true)}
                      className="rounded-md border border-pine px-3 py-1.5 text-pine transition hover:bg-pine hover:text-white"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>

              {editing?.id === m._id && (
                <form onSubmit={saveAccess} className="mt-5 space-y-6 rounded-md border border-line bg-paper p-5">
                  <PermissionPicker value={editing.permissions} onChange={(list) => setEditing({ id: m._id, permissions: list })} canGrant={can} />
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={busy} className={btnPine}>
                      {busy ? 'Saving…' : 'Save access'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="inline-flex h-11 items-center rounded-md border border-line bg-white px-5 text-[13px] font-medium text-ink transition hover:border-ink"
                    >
                      Cancel
                    </button>
                  </div>
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