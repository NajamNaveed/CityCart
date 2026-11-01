import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { EmptyState, Skeleton } from '../components/ui'
import { wrap } from '../ui'

// The customer's saved delivery addresses. New ones are saved from checkout, where the
// pin is chosen on the map; here they can be set as the default or deleted.
export default function MyAddresses() {
  const [state, setState] = useState({ list: null, error: '' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/addresses')
      .then((res) => active && setState({ list: res.data.addresses, error: '' }))
      .catch((err) => active && setState({ list: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [reload])

  async function run(action) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      setReload((n) => n + 1)
    } catch (err) {
      setMessage(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const { list, error } = state
  return (
    <div className={`${wrap} py-10`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Your account</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Saved addresses</h1>
      <p className="mt-2 max-w-xl text-[13.5px] text-muted">
        Addresses you save at checkout appear here. Orders you have already placed keep the address they were sent to.
      </p>
      {message && (
        <p role="alert" className="mt-5 rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          {message}
        </p>
      )}

      <div className="mt-8 max-w-2xl space-y-4">
        {error ? (
          <p className="text-clay">{error}</p>
        ) : !list ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No saved addresses yet"
            message="Tick “Save this address” when you check out and it will be here next time."
            className="rounded-lg border border-dashed border-line bg-white"
          />
        ) : (
          list.map((a) => (
            <article key={a._id} className="rounded-lg border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-ink">
                    {a.label}
                    {a.isDefault && <span className="ml-2 rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Default</span>}
                  </p>
                  <p className="mt-1 text-ink/80">
                    {a.fullName} · {a.phone}
                  </p>
                  <p className="text-muted">
                    {a.addressLine}, {a.city}
                  </p>
                  {a.blocks.length > 0 ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-clay">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {a.blocks.map((b) => b.name).join(' + ')}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-danger">We no longer deliver to this spot.</p>
                  )}
                </div>
                <div className="flex gap-2.5 text-[12.5px] font-medium">
                  {!a.isDefault && (
                    <button type="button" disabled={busy} onClick={() => run(() => api.post(`/addresses/${a._id}/default`))} className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink disabled:opacity-50">
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => window.confirm(`Delete “${a.label}”?`) && run(() => api.delete(`/addresses/${a._id}`))}
                    className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
