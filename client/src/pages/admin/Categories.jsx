import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader, selectClass } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import useReadOnly from '../../hooks/useReadOnly'
import { btnDark, inputClass } from '../../ui'

// One global category tree for the whole platform, two levels deep. Brands only
// choose a subcategory (or a top-level category with none) for each product.
export default function Categories() {
  const readOnly = useReadOnly()
  const [tree, setTree] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editing, setEditing] = useState(null) // { id, name }
  const [confirmId, setConfirmId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  useEffect(() => {
    let active = true
    api
      .get('/categories/tree')
      .then((res) => active && setTree(res.data.categories))
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [reload])

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

  const row = (c, { child }) => (
    <li key={c._id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${child ? 'pl-10' : ''}`}>
      {editing?.id === c._id ? (
        <form onSubmit={onRename} className="flex flex-1 flex-wrap items-center gap-3">
          <label htmlFor={`rename-${c._id}`} className="sr-only">
            Category name
          </label>
          <input
            id={`rename-${c._id}`}
            value={editing.name}
            onChange={(e) => setEditing({ id: c._id, name: e.target.value })}
            className={`h-10 min-w-0 flex-1 basis-48 ${inputClass}`}
            required
            autoFocus
          />
          <button type="submit" disabled={busy || readOnly} className="inline-flex h-9 items-center rounded-tile bg-noir px-4 text-[12.5px] font-medium text-cream disabled:opacity-50">
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="inline-flex h-9 items-center rounded-tile border border-line-warm bg-paper-warm px-4 text-[12.5px] font-medium text-ink transition hover:border-ink"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className={child ? 'text-ink' : 'font-medium text-ink'}>{c.name}</span>
          <span className="flex gap-2.5 text-[12.5px] font-medium">
            {confirmId === c._id ? (
              <>
                <span className="self-center text-ink/55">Remove “{c.name}”?</span>
                <button
                  type="button"
                  disabled={busy || readOnly}
                  onClick={async () => {
                    await run(() => api.delete(`/categories/${c._id}`), 'Category removed.')
                    setConfirmId(null)
                  }}
                  className="rounded-tile bg-clay px-3 py-1.5 text-cream transition hover:bg-clay-dark disabled:opacity-50"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="rounded-tile border border-line-warm px-3 py-1.5 text-ink transition hover:border-ink"
                >
                  Keep
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setEditing({ id: c._id, name: c.name })}
                  aria-label={`Rename ${c.name}`}
                  className="rounded-tile border border-line-warm px-3 py-1.5 text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busy || readOnly}
                  onClick={() => setConfirmId(c._id)}
                  aria-label={`Remove ${c.name}`}
                  className="rounded-tile border border-clay/40 px-3 py-1.5 text-clay transition hover:border-clay disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </>
            )}
          </span>
        </>
      )}
    </li>
  )

  return (
    <>
      <PageHeader
        title="Categories"
        intro="One tree for the whole marketplace: categories and subcategories. Brands choose from it when they list a product."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <form onSubmit={onAdd} className="mb-8 flex flex-wrap items-end gap-3 rounded-card border border-line-warm bg-paper-warm p-5">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="cat-name" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
            New category
          </label>
          <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cooking oil & ghee" className={`h-11 ${inputClass}`} required />
        </div>
        <div>
          <label htmlFor="cat-parent" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
            Inside
          </label>
          <select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className={`${selectClass} h-11`}>
            <option value="">Top level</option>
            {(tree || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy || readOnly || !name.trim()} className={btnDark}>
          Add
        </button>
      </form>
      {readOnly && (
        <p className="mb-6 -mt-4 text-[12.5px] text-ink/55">Your access is read-only, so categories cannot be changed.</p>
      )}

      {loadError ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{loadError}</p>
      ) : !tree ? (
        <Skeleton className="h-32" />
      ) : tree.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-warm bg-paper-warm p-8 text-center text-sm text-ink/55">
          No categories yet. Add the first one above.
        </p>
      ) : (
        <div className="space-y-4">
          {tree.map((c) => (
            <ul key={c._id} className="divide-y divide-line-warm rounded-card border border-line-warm bg-paper-warm">
              {row(c, { child: false })}
              {c.children.map((child) => row(child, { child: true }))}
            </ul>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-ink/55">
        Categories go two levels deep. A category can only be removed once it has no products or subcategories.
      </p>
    </>
  )
}
