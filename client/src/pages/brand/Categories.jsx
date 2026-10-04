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
      <form onSubmit={onAdd} className="mb-10 flex flex-wrap items-end gap-3 border border-line bg-paper p-5">
        <div className="flex-1 basis-56">
          <label htmlFor="cat-name" className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
            New category
          </label>
          <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Printed fabric" className={`h-11 ${inputClass}`} required />
        </div>
        <div>
          <label htmlFor="cat-parent" className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
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
        <div className="h-32 animate-pulse bg-sand" />
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted">No categories yet. Add one above, then you can add products to it.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {categories.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              {editing?.id === c._id ? (
                <form onSubmit={onRename} className="flex flex-1 flex-wrap items-center gap-3">
                  <label htmlFor={`rename-${c._id}`} className="sr-only">
                    Category name
                  </label>
                  <input id={`rename-${c._id}`} value={editing.name} onChange={(e) => setEditing({ id: c._id, name: e.target.value })} className={`h-10 flex-1 basis-48 ${inputClass}`} required autoFocus />
                  <button type="submit" disabled={busy} className="text-[13px] font-medium text-pine hover:underline">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="text-[13px] text-muted hover:underline">
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    <span className="font-medium">{c.name}</span>
                    {c.parentId && <span className="ml-3 text-xs text-muted">inside {nameOf[c.parentId] || 'another category'}</span>}
                  </span>
                  <span className="flex gap-5 text-[13px] font-medium">
                    {can('categories.update') && (
                      <button type="button" onClick={() => setEditing({ id: c._id, name: c.name })} className="text-pine hover:underline">
                        Rename
                      </button>
                    )}
                    {can('categories.delete') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => api.delete(`/categories/${c._id}`), 'Category removed.')}
                        className="text-clay hover:underline"
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