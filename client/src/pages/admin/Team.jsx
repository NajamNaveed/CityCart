import { useEffect, useState } from 'react'
import { KeyRound, Plus, UserCog } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import Modal from '../../components/ui/Modal'
import { EmptyState, Skeleton } from '../../components/ui'
import { Notice, PageHeader, Pager, StatusBadge } from '../../components/brand/Bits'
import { ADMIN_PERMISSION_OPTIONS, ADMIN_PRESETS } from '../../utils/adminPermissions'
import { btnDark } from '../../ui'

const EMPTY = { name: '', email: '', password: '', phone: '' }
const MAX_ACTIVE = 5

function PermissionTicks({ value, onChange }) {
  const toggle = (key) =>
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key])

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {ADMIN_PERMISSION_OPTIONS.map(({ key, label, hint }) => (
        <label
          key={key}
          className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-white px-3.5 py-3 transition hover:border-ink/40"
        >
          <input
            type="checkbox"
            checked={value.includes(key)}
            onChange={() => toggle(key)}
            className="mt-0.5 h-4 w-4 accent-ink"
          />
          <span>
            <span className="block text-[13px] font-medium text-ink">{label}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

function PresetButtons({ onApply }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ADMIN_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => onApply(preset)}
          className="rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-ink"
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onApply({ permissions: [], readOnly: false })}
        className="rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-muted transition hover:border-ink hover:text-ink"
      >
        Clear
      </button>
    </div>
  )
}

export default function AdminTeam() {
  const [partners, setPartners] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [permissions, setPermissions] = useState(ADMIN_PRESETS[0].permissions)
  const [readOnly, setReadOnly] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const [editing, setEditing] = useState(null) // { id, permissions, readOnly }
  const [confirmOff, setConfirmOff] = useState(null)
  const [resetting, setResetting] = useState(null)
  const [tempPassword, setTempPassword] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/admin/partners', { params: { limit: 20, page } })
      .then((res) => {
        if (!active) return
        setPartners(res.data.items)
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

  function applyPreset(preset) {
    setPermissions(preset.permissions)
    setReadOnly(preset.readOnly)
  }

  async function onAdd(e) {
    e.preventDefault()
    setFieldErrors({})
    const ok = await run(
      () =>
        api.post('/admin/partners', {
          name: form.name,
          email: form.email,
          password: form.password,
          permissions,
          readOnly,
          ...(form.phone.trim() && { phone: form.phone }),
        }),
      'Partner added. Give them the email and temporary password; they must choose a new password at first sign-in.',
    )
    if (ok) {
      setForm(EMPTY)
      setPermissions(ADMIN_PRESETS[0].permissions)
      setReadOnly(false)
      setAdding(false)
    }
  }

  async function saveAccess(e) {
    e.preventDefault()
    const ok = await run(
      () =>
        api.patch(`/admin/partners/${editing.id}`, {
          permissions: editing.permissions,
          readOnly: editing.readOnly,
        }),
      'Partner access updated. The change applies immediately.',
    )
    if (ok) setEditing(null)
  }

  const setActive = (partner, isActive) =>
    run(
      isActive
        ? () => api.patch(`/admin/partners/${partner._id}`, { isActive: true })
        : () => api.delete(`/admin/partners/${partner._id}`),
      isActive
        ? 'Partner reactivated. They can sign in again.'
        : 'Partner deactivated. They are signed out and cannot sign in.',
    ).then(() => setConfirmOff(null))

  async function onResetPassword(e) {
    e.preventDefault()
    const password = tempPassword
    const ok = await run(
      () => api.patch(`/admin/partners/${resetting._id}/password`, { password }),
      `Password reset. Give them this temporary password: ${password} — they must change it at first sign-in.`,
    )
    if (ok) {
      setResetting(null)
      setTempPassword('')
    }
  }

  const activeCount = (partners || []).filter((partner) => partner.isActive).length
  const atLimit = activeCount >= MAX_ACTIVE

  return (
    <>
      <PageHeader
        title="Admin team"
        intro="People who help run the platform. They see only the areas you tick, and cannot manage other admins."
        action={
          <button type="button" onClick={() => setAdding((v) => !v)} className={btnDark}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {adding ? 'Close' : 'Add partner'}
          </button>
        }
      />

      {!loadError && partners && (
        <p className="mb-5 text-[12.5px] text-muted">
          {activeCount} of {MAX_ACTIVE} active partners.
          {atLimit && ' Deactivate one to open a seat.'}
        </p>
      )}
      <Notice tone={message.tone}>{message.text}</Notice>

      {adding && (
        <form onSubmit={onAdd} noValidate className="mb-8 space-y-7 rounded-lg border border-line bg-white p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" id="p-name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
            <Field label="Email" id="p-email" name="email" type="email" value={form.email} onChange={onChange} error={fieldErrors.email} required />
            <Field label="Phone" id="p-phone" name="phone" type="tel" value={form.phone} onChange={onChange} error={fieldErrors.phone} hint="Optional." />
            <Field
              label="Temporary password"
              id="p-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={onChange}
              error={fieldErrors.password}
              hint="They must replace it at first sign-in."
              required
            />
          </div>
          <div>
            <h2 className="mb-1 text-[15px] font-semibold text-ink">What can they open?</h2>
            <p className="mb-4 text-[13px] text-muted">
              Start from a preset, then adjust. Read-only partners can open their areas but change nothing.
            </p>
            <PresetButtons onApply={applyPreset} />
            <div className="mt-4">
              <PermissionTicks value={permissions} onChange={setPermissions} />
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-paper px-3.5 py-3 text-[13px] text-ink">
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="h-4 w-4 accent-ink" />
              Read only — can view their areas but never change anything
            </label>
            {fieldErrors.permissions && <p className="mt-3 text-xs text-clay">{fieldErrors.permissions}</p>}
          </div>
          <button type="submit" disabled={busy || atLimit} className={btnDark}>
            {busy ? 'Adding…' : 'Add partner'}
          </button>
        </form>
      )}

      {loadError ? (
        <p role="alert" className="text-clay">{loadError}</p>
      ) : !partners ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : partners.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No admin partners yet."
          message="Add someone to help with brands, orders or reviews. You can limit them to exactly what they need."
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <>
          <ul className="space-y-3">
            {partners.map((partner) => (
              <li key={partner._id} className="rounded-lg border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {partner.user?.name}
                      {partner.readOnly && (
                        <span className="ml-2 rounded border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-warning">
                          Read only
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-muted">{partner.user?.email}</p>
                    {partner.user?.phone && <p className="text-[12.5px] text-muted">{partner.user.phone}</p>}
                    <p className="mt-1 text-xs text-muted">
                      {partner.permissions.length === 0
                        ? 'No areas assigned'
                        : ADMIN_PERMISSION_OPTIONS.filter((option) => partner.permissions.includes(option.key))
                            .map((option) => option.label)
                            .join(' · ')}
                    </p>
                    {partner.user?.mustChangePassword && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-warning">
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        Has not chosen a password yet
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-medium">
                    <StatusBadge value={partner.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(
                          editing?.id === partner._id
                            ? null
                            : { id: partner._id, permissions: partner.permissions, readOnly: partner.readOnly },
                        )
                      }
                      className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink"
                    >
                      {editing?.id === partner._id ? 'Close' : 'Edit access'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetting(partner)
                        setTempPassword('')
                        setFieldErrors({})
                      }}
                      className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink"
                    >
                      Reset password
                    </button>
                    {partner.isActive ? (
                      confirmOff === partner._id ? (
                        <span className="flex items-center gap-2.5 rounded-md bg-danger-soft px-3 py-1.5 font-normal text-danger">
                          Deactivate?
                          <button type="button" disabled={busy} onClick={() => setActive(partner, false)} className="font-semibold hover:underline">
                            Yes
                          </button>
                          <button type="button" onClick={() => setConfirmOff(null)} className="text-muted hover:text-ink">
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmOff(partner._id)}
                          className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger"
                        >
                          Deactivate
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={busy || atLimit}
                        onClick={() => setActive(partner, true)}
                        className="rounded-md border border-pine px-3 py-1.5 text-pine transition hover:bg-pine hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>

                {editing?.id === partner._id && (
                  <form onSubmit={saveAccess} className="mt-5 space-y-5 rounded-md border border-line bg-paper p-5">
                    <PresetButtons
                      onApply={(preset) => setEditing({ ...editing, permissions: preset.permissions, readOnly: preset.readOnly })}
                    />
                    <PermissionTicks
                      value={editing.permissions}
                      onChange={(list) => setEditing({ ...editing, permissions: list })}
                    />
                    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={editing.readOnly}
                        onChange={(e) => setEditing({ ...editing, readOnly: e.target.checked })}
                        className="h-4 w-4 accent-ink"
                      />
                      Read only — can view but never change anything
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="submit" disabled={busy} className={btnDark}>
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

      <Modal open={Boolean(resetting)} onClose={() => setResetting(null)} title="Reset password">
        {resetting && (
          <form onSubmit={onResetPassword} className="space-y-5" noValidate>
            <p className="text-[13px] text-muted">
              Set a temporary password for <strong className="text-ink">{resetting.user?.name}</strong>. They are signed
              out everywhere and must choose a new password at next sign-in.
            </p>
            <Field
              label="Temporary password"
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              error={fieldErrors.password}
              required
            />
            <button type="submit" disabled={busy} className={btnDark}>
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        )}
      </Modal>
    </>
  )
}
