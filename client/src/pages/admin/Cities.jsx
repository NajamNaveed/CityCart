import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import { Notice, PageHeader, StatusBadge } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { btnDark, inputClass } from '../../ui'

const EMPTY = { name: '', state: '', country: '' }

export default function Cities() {
  const [cities, setCities] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [editing, setEditing] = useState(null) // { id, name, state, country }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  useEffect(() => {
    let active = true
    api
      .get('/cities')
      .then((res) => active && setCities(res.data.cities))
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [reload])

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
        api.post('/cities', {
          name: form.name,
          ...(form.state.trim() && { state: form.state }),
          ...(form.country.trim() && { country: form.country }),
        }),
      'City added.',
    )
    if (ok) setForm(EMPTY)
  }

  async function onSave(e) {
    e.preventDefault()
    const { id, name, state, country } = editing
    const ok = await run(() => api.patch(`/cities/${id}`, { name, state, country }), 'City updated.')
    if (ok) setEditing(null)
  }

  const setActive = (city, isActive) =>
    run(() => api.patch(`/cities/${city._id}`, { isActive }), isActive ? 'City reactivated.' : 'City deactivated. It no longer appears for shoppers.')

  return (
    <>
      <PageHeader title="Cities" intro="Where CityCart operates. Brands and shoppers choose from active cities." />
      <Notice tone={message.tone}>{message.text}</Notice>

      <form onSubmit={onAdd} noValidate className="mb-8 grid gap-4 rounded-lg border border-line bg-white p-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="New city" id="c-name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
        <Field label="Province or state" id="c-state" name="state" value={form.state} onChange={onChange} error={fieldErrors.state} />
        <Field label="Country" id="c-country" name="country" value={form.country} onChange={onChange} error={fieldErrors.country} />
        <button type="submit" disabled={busy || !form.name.trim()} className={`${btnDark} h-11`}>
          Add
        </button>
      </form>

      {loadError ? (
        <p className="text-clay">{loadError}</p>
      ) : !cities ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : cities.length === 0 ? (
        <EmptyState icon={MapPin} title="No cities yet." message="Add one above — brands and shoppers choose from active cities." className="rounded-lg border border-dashed border-line bg-white" />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {cities.map((c) => (
            <li key={c._id} className="px-5 py-4">
              {editing?.id === c._id ? (
                <form onSubmit={onSave} className="flex flex-wrap items-center gap-3">
                  {['name', 'state', 'country'].map((field) => (
                    <div key={field} className="min-w-0 flex-1 basis-40">
                      <label htmlFor={`edit-${field}`} className="sr-only">
                        City {field}
                      </label>
                      <input
                        id={`edit-${field}`}
                        value={editing[field]}
                        onChange={(e) => setEditing({ ...editing, [field]: e.target.value })}
                        placeholder={field === 'name' ? 'Name' : field === 'state' ? 'Province or state' : 'Country'}
                        className={`h-10 ${inputClass}`}
                        required={field === 'name'}
                      />
                    </div>
                  ))}
                  <button
                    type="submit"
                    disabled={busy || !editing.name.trim()}
                    className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-[12.5px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="inline-flex h-9 items-center rounded-md border border-line bg-white px-4 text-[12.5px] font-medium text-ink transition hover:border-ink"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="ml-3 text-sm text-muted">{[c.state, c.country].filter(Boolean).join(', ')}</span>
                  </span>
                  <span className="flex items-center gap-2.5 text-[12.5px] font-medium">
                    <StatusBadge value={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    <button
                      type="button"
                      onClick={() => setEditing({ id: c._id, name: c.name, state: c.state || '', country: c.country || '' })}
                      className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink"
                    >
                      Edit
                    </button>
                    {c.isActive ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setActive(c, false)}
                        className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setActive(c, true)}
                        className="rounded-md border border-pine px-3 py-1.5 text-pine transition hover:bg-pine hover:text-white"
                      >
                        Reactivate
                      </button>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}