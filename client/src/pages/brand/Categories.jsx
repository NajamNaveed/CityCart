import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import { Notice, PageHeader, selectClass } from '../../components/brand/Bits'
import { btnPine, inputClass } from '../../ui'

export default function Categories() {
  const { user } = useAuth()
  const can = useCan()
  const [categories, setCategories] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editing, setEditing] = useState(null) // { id, name }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  useEffect(() => {
    let active = true
    api
      .get('/categories', { params: { brandId: user.brandId } })
      .then((res) => active && setCategories(res.data.categories))
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [user.brandId, reload])

  async function run(action, success) {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      await action()
      setMessage({ text: success, tone: 'ok' })
      setReload((n) => n + 1)
      return true
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onAdd(e) {
    e.preventDefault()
    const ok = await run(() => api.post('/categories', { name, ...(parentId && { parentId }) }), 'Category added.')
    if (ok) {
      setName('')
      setParentId('')
    }
  }

  async function onRename(e) {
    e.preventDefault()
    const ok = await run(() => api.patch(`/categories/${editing.id}`, { name: editing.name }), 'Category renamed.')
    if (ok) setEditing(null)
  }

  const nameOf = Object.fromEntries((categories || []).map((c) => [c._id, c.name]))

  return (
    <>
      <PageHeader title="Categories" intro="Group your products so customers can find them." />
      <Notice tone={message.tone}>{message.text}</Notice>

      {can('categories.create') && (
      <form onSubmit={onAdd} className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-5">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="cat-name" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            New category
          </label>
          <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Printed fabric" className={`h-11 ${inputClass}`} required />
        </div>
        <div>
          <label htmlFor="cat-parent" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
            Inside
          </label>
          <select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={`${selectClass} h-11`}>
            <option value="">Top level</option>
            {(categories || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy || !name.trim()} className={btnPine}>
          Add
        </button>
      </form>
      )}

      {loadError ? (
        <p className="text-clay">{loadError}</p>
      ) : !categories ? (
        <div className="h-32 animate-pulse rounded-lg bg-sand" />
      ) : categories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
          No categories yet. Add one above, then you can add products to it.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {categories.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              {editing?.id === c._id ? (
                <form onSubmit={onRename} className="flex flex-1 flex-wrap items-center gap-3">
                  <label htmlFor={`rename-${c._id}`} className="sr-only">
                    Category name
                  </label>
                  <input id={`rename-${c._id}`} value={editing.name} onChange={(e) => setEditing({ id: c._id, name: e.target.value })} className={`h-10 min-w-0 flex-1 basis-48 ${inputClass}`} required autoFocus />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-md bg-pine px-4 text-[12.5px] font-medium text-white transition hover:bg-pine-dark disabled:opacity-50"
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
                <>
                  <span>
                    <span className="font-medium text-ink">{c.name}</span>
                    {c.parentId && <span className="ml-3 text-xs text-muted">inside {nameOf[c.parentId] || 'another category'}</span>}
                  </span>
                  <span className="flex gap-2.5 text-[12.5px] font-medium">
                    {can('categories.update') && (
                      <button
                        type="button"
                        onClick={() => setEditing({ id: c._id, name: c.name })}
                        className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink"
                      >
                        Rename
                      </button>
                    )}
                    {can('categories.delete') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => api.delete(`/categories/${c._id}`), 'Category removed.')}
                        className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">A category can only be removed once it has no products or subcategories.</p>
    </>
  )
}