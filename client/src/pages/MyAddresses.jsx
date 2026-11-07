import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  card,
  shell,
} from '../design'

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
    <div className="bg-canvas">
      <div className={`${shell} max-w-[880px] pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Your account"
          title="Saved addresses"
          lede="Addresses you save at checkout appear here. Orders you have already placed keep the address they were sent to."
        />

        {message && (
          <p
            role="alert"
            className="mt-6 rounded-tile border border-clay/30 bg-clay/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-clay"
          >
            {message}
          </p>
        )}

        <div className="mt-8 max-w-2xl space-y-3">
          {error ? (
            <ErrorState
              title="Could not load your addresses"
              message={error}
              onRetry={() => {
                setState({ list: null, error: '' })
                setReload((n) => n + 1)
              }}
            />
          ) : !list ? (
            <>
              {[0, 1].map((i) => (
                <div key={i} className={`${card} space-y-3 p-5`}>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-3.5 w-44" />
                </div>
              ))}
            </>
          ) : list.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No saved addresses yet"
              message="Tick “Save this address” when you check out and it will be here next time."
              action={
                <Button to="/nearby" tone="noir" size="md">
                  Start an order
                </Button>
              }
            />
          ) : (
            list.map((a) => (
              <article key={a._id} className={`${card} p-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-[17px] font-semibold tracking-tight text-ink">{a.label}</p>
                      {a.isDefault && <Badge tone="sage">Default</Badge>}
                    </div>
                    <p className="mt-2 text-ink/75">
                      {a.fullName} · {a.phone}
                    </p>
                    <p className="mt-0.5 text-ink/55">
                      {a.addressLine}, {a.city}
                    </p>
                    {a.blocks.length > 0 ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-clay">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {a.blocks.map((b) => b.name).join(' + ')}
                      </p>
                    ) : (
                      <p className="mt-2 text-[11.5px] font-medium text-clay">We no longer deliver to this spot.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {!a.isDefault && (
                      <Button
                        tone="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => run(() => api.post(`/addresses/${a._id}/default`))}
                      >
                        Make default
                      </Button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => window.confirm(`Delete “${a.label}”?`) && run(() => api.delete(`/addresses/${a._id}`))}
                      className="inline-flex h-9 items-center rounded-tile border border-clay/25 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-clay transition hover:border-clay hover:bg-clay/5 disabled:pointer-events-none disabled:opacity-50"
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
    </div>
  )
}
