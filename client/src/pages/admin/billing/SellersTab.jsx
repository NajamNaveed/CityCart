import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Search, Store } from 'lucide-react'
import api, { getErrorMessage } from '../../../services/api'
import { EmptyState, Modal, Skeleton, toast } from '../../../components/ui'
import { Pager, StatusBadge, selectClass, tableHead, tableRow, tableShell } from '../../../components/brand/Bits'
import { btnGhost, btnPine, formatDate, formatDateTime, inputClass } from '../../../ui'
import { BILLING_STATUS_OPTIONS, SELLER_TYPE_OPTIONS, formatPaisa } from '../../../utils/billingUi'

const STATUS_FILTERS = ['', ...BILLING_STATUS_OPTIONS]

function StatusNote({ seller }) {
  if (seller.graceUntil) {
    return (
      <p className="mt-1 text-[11.5px] text-muted">
        Grace until {formatDateTime(seller.graceUntil)}
      </p>
    )
  }
  return null
}

function SellerActions({ seller, onDone }) {
  const [mode, setMode] = useState('status')
  const [status, setStatus] = useState(seller.billingStatus || 'ACTIVE')
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [graceUntil, setGraceUntil] = useState('')
  const [graceReason, setGraceReason] = useState('')
  const [clearReason, setClearReason] = useState('')
  const [busy, setBusy] = useState(false)

  const base = `/admin/billing/sellers/${seller.sellerType}/${seller.sellerId}`

  async function send(path, body, message, method = 'post') {
    setBusy(true)
    try {
      const { data } = await api.request({ url: `${base}${path}`, method, data: body })
      toast(message || data.message, { type: 'success' })
      onDone()
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function saveStatus(event) {
    event.preventDefault()
    if (reason.trim().length < 3) {
      toast('Tell the seller why the status changed.', { type: 'error' })
      return
    }
    send(
      '/override',
      {
        status,
        reason: reason.trim(),
        ...(until && { until: new Date(until).toISOString() }),
      },
      `Status set to ${status}.`,
    )
  }

  function clearOverride(event) {
    event.preventDefault()
    if (clearReason.trim().length < 3) {
      toast('Tell the seller why the manual status was removed.', { type: 'error' })
      return
    }
    send('/clear-freeze', { reason: clearReason.trim() }, 'Manual status removed.')
  }

  function grantGrace(event) {
    event.preventDefault()
    if (!graceUntil) {
      toast('Pick when the grace period ends.', { type: 'error' })
      return
    }
    if (graceReason.trim().length < 3) {
      toast('Tell the seller why they get grace.', { type: 'error' })
      return
    }
    send(
      '/grace',
      { until: new Date(graceUntil).toISOString(), reason: graceReason.trim() },
      'Grace period granted.',
    )
  }

  function revokeGrace() {
    send('', {}, 'Grace period removed.', 'delete')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-paper/60 p-4">
        <p className="text-sm font-medium text-ink">{seller.name}</p>
        <p className="mt-1 text-[12.5px] text-muted">
          {seller.sellerType === 'BRAND' ? 'Brand' : 'Service provider'} · balance{' '}
          {formatPaisa(seller.balancePaisa)}
          {seller.oldestDueAt ? ` · oldest due ${formatDate(seller.oldestDueAt)}` : ''}
        </p>
        <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink">
          Current status <StatusBadge value={seller.billingStatus || 'ACTIVE'} />
        </p>
        {seller.graceUntil && (
          <p className="mt-1 text-[12px] text-muted">
            Grace period until {formatDateTime(seller.graceUntil)}.
          </p>
        )}
      </div>

      <div role="tablist" aria-label="Seller controls" className="flex flex-wrap gap-1 border-b border-line">
        {[
          ['status', 'Set status'],
          ['grace', 'Grace period'],
          ['clear', 'Remove override'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors ${
              mode === value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'status' && (
        <form onSubmit={saveStatus} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="seller-status" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
                New status
              </label>
              <select id="seller-status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                {BILLING_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="seller-until" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
                Revert after (optional)
              </label>
              <input
                id="seller-until"
                type="datetime-local"
                className={`h-10 ${inputClass}`}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="seller-reason" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
              Reason (shown to the seller)
            </label>
            <textarea
              id="seller-reason"
              rows={2}
              maxLength={500}
              className={`${inputClass} py-2.5`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>
          <p className="text-[12px] text-muted">
            A manual status wins over the automatic due-date ladder until it is removed or its revert date passes.
          </p>
          <button type="submit" disabled={busy} className={btnPine}>
            {busy ? 'Saving…' : 'Set status'}
          </button>
        </form>
      )}

      {mode === 'grace' && (
        <form onSubmit={grantGrace} className="space-y-3">
          {seller.graceUntil ? (
            <div className="space-y-3 rounded-md border border-line p-3">
              <p className="text-[13px] text-ink">
                Grace runs until {formatDateTime(seller.graceUntil)}. During grace the automatic ladder is paused.
              </p>
              <button type="button" onClick={revokeGrace} disabled={busy} className={btnGhost}>
                End grace now
              </button>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="grace-until" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
                  Grace ends
                </label>
                <input
                  id="grace-until"
                  type="datetime-local"
                  className={`h-10 ${inputClass}`}
                  value={graceUntil}
                  onChange={(event) => setGraceUntil(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="grace-reason" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
                  Reason (shown to the seller)
                </label>
                <textarea
                  id="grace-reason"
                  rows={2}
                  maxLength={500}
                  className={`${inputClass} py-2.5`}
                  value={graceReason}
                  onChange={(event) => setGraceReason(event.target.value)}
                  required
                />
              </div>
              <button type="submit" disabled={busy} className={btnPine}>
                {busy ? 'Saving…' : 'Grant grace'}
              </button>
            </>
          )}
        </form>
      )}

      {mode === 'clear' && (
        <form onSubmit={clearOverride} className="space-y-3">
          <p className="text-[13px] text-muted">
            Removing the manual status lets the due-date ladder decide the status again on the next refresh.
          </p>
          <div>
            <label htmlFor="clear-reason" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
              Reason (logged with the action)
            </label>
            <textarea
              id="clear-reason"
              rows={2}
              maxLength={500}
              className={`${inputClass} py-2.5`}
              value={clearReason}
              onChange={(event) => setClearReason(event.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={busy} className={btnGhost}>
            {busy ? 'Saving…' : 'Remove manual status'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function SellersTab({ onChanged }) {
  const [filters, setFilters] = useState({ billingStatus: '', type: '', q: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [managing, setManaging] = useState(null)

  const load = useCallback(
    async (nextPage = 1, nextFilters = filters) => {
      setLoading(true)
      setError('')
      try {
        const { data: body } = await api.get('/admin/billing/sellers', {
          params: {
            page: nextPage,
            limit: 20,
            ...(nextFilters.billingStatus && { billingStatus: nextFilters.billingStatus }),
            ...(nextFilters.type && { type: nextFilters.type }),
            ...(nextFilters.q && { q: nextFilters.q }),
          },
        })
        setData({ items: body.sellers, pagination: body.pagination })
        setPage(nextPage)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [filters],
  )

  useEffect(() => {
    load(1)
  }, [load])

  function applyFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  function submitSearch(event) {
    event.preventDefault()
    applyFilter({ q: search.trim() })
  }

  async function afterChange() {
    setManaging(null)
    await load(page)
    if (onChanged) onChanged()
  }

  return (
    <>
      <form onSubmit={submitSearch} className="mb-4 flex flex-wrap items-end gap-2">
        <select
          aria-label="Billing status"
          className={selectClass}
          value={filters.billingStatus}
          onChange={(event) => applyFilter({ billingStatus: event.target.value })}
        >
          <option value="">All statuses</option>
          {STATUS_FILTERS.filter(Boolean).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          aria-label="Seller type"
          className={selectClass}
          value={filters.type}
          onChange={(event) => applyFilter({ type: event.target.value })}
        >
          <option value="">All sellers</option>
          {SELLER_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label htmlFor="seller-search" className="sr-only">
          Search sellers
        </label>
        <input
          id="seller-search"
          className={`h-10 w-56 ${inputClass}`}
          placeholder="Search by name"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" className={btnGhost}>
          <Search className="h-4 w-4" aria-hidden="true" /> Search
        </button>
        <button
          type="button"
          onClick={() => {
            setSearch('')
            setFilters({ billingStatus: '', type: '', q: '' })
          }}
          className={btnGhost}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reset
        </button>
      </form>

      {error && <p className="mb-4 rounded-md bg-clay/5 px-3 py-2 text-sm text-clay">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <>
          <div className={tableShell}>
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Oldest due</th>
                  <th className="px-4 py-3">Billing status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState icon={Store} title="No sellers match" message="Change the filters to see more accounts." />
                    </td>
                  </tr>
                ) : (
                  data.items.map((seller) => (
                    <tr key={`${seller.sellerType}:${seller.sellerId}`} className={tableRow}>
                      <td className="px-4 py-3">
                        <span className="text-ink">{seller.name}</span>
                        {seller.phone && <span className="block text-[11.5px] text-muted">{seller.phone}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {seller.sellerType === 'BRAND' ? 'Brand' : 'Service provider'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink">{formatPaisa(seller.balancePaisa)}</td>
                      <td className="px-4 py-3 text-muted">
                        {seller.oldestDueAt ? formatDate(seller.oldestDueAt) : '—'}
                        {seller.unpaidInvoiceCount > 0 && (
                          <span className="block text-[11.5px]">
                            {seller.unpaidInvoiceCount} unpaid
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={seller.billingStatus || 'ACTIVE'} />
                        <StatusNote seller={seller} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setManaging(seller)}
                          className="text-[12.5px] font-medium text-pine hover:underline"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager pagination={data.pagination} onPage={(next) => load(next)} />
        </>
      )}

      {managing && (
        <Modal open onClose={() => setManaging(null)} title="Seller billing controls" maxWidth="max-w-xl">
          <SellerActions seller={managing} onDone={afterChange} />
        </Modal>
      )}
    </>
  )
}
