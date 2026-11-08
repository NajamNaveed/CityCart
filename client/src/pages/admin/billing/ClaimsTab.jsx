import { useCallback, useEffect, useState } from 'react'
import { Receipt, ShieldCheck } from 'lucide-react'
import api, { getErrorMessage } from '../../../services/api'
import { EmptyState, Modal, Skeleton, toast } from '../../../components/ui'
import { Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../../components/brand/Bits'
import { btnGhost, btnPine, formatDateTime, inputClass } from '../../../ui'
import { CLAIM_STATUS_OPTIONS, formatPaisa } from '../../../utils/billingUi'

export default function ClaimsTab({ onChanged }) {
  const [status, setStatus] = useState('SUBMITTED')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deciding, setDeciding] = useState(null)
  const [decision, setDecision] = useState('VERIFIED')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (nextPage = 1) => {
      setLoading(true)
      setError('')
      try {
        const { data: body } = await api.get('/admin/billing/claims', {
          params: { page: nextPage, limit: 20, ...(status && { status }) },
        })
        setData({ items: body.claims, pagination: body.pagination })
        setPage(nextPage)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [status],
  )

  useEffect(() => {
    load(1)
  }, [load])

  async function openReceipt(claim) {
    try {
      const { data: body } = await api.get(`/admin/billing/claims/${claim._id}/receipt`)
      window.open(body.receipt.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    }
  }

  function openDecision(claim, next) {
    setDeciding(claim)
    setDecision(next)
    setNote('')
    setBusy(false)
  }

  async function submitDecision(event) {
    event.preventDefault()
    if (decision === 'REJECTED' && note.trim().length < 3) {
      toast('A rejection needs a reason.', { type: 'error' })
      return
    }
    setBusy(true)
    try {
      const { data: body } = await api.post(`/admin/billing/claims/${deciding._id}/decision`, {
        decision,
        ...(note.trim() && { note: note.trim() }),
      })
      toast(body.message, { type: 'success' })
      setDeciding(null)
      load(page)
      if (onChanged) onChanged()
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Claim status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All claims</option>
          {CLAIM_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className="text-[12.5px] text-ink/55">
          Verifying a claim pays the invoice and, if it was the last unpaid bill, restores the seller immediately.
        </p>
      </div>

      {error && <p className="mb-4 rounded-tile bg-clay/5 px-3 py-2 text-sm text-clay">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing to check" message="Claims matching this filter appear here." />
      ) : (
        <>
          <TableScroll label="Payment claims">
            <table className="w-full min-w-[900px] text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method / reference</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((claim) => (
                  <tr key={claim._id} className={tableRow}>
                    <td className="px-4 py-3 text-ink/55">{formatDateTime(claim.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{claim.seller?.name || 'Unknown seller'}</span>
                      <span className="block text-[11.5px] text-ink/55">
                        {claim.sellerType === 'BRAND' ? 'Brand' : 'Service provider'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/55">
                      {claim.invoice ? `${claim.invoice.periodKey} · ${formatPaisa(claim.invoice.amountDuePaisa)} due` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{formatPaisa(claim.amountPaisa)}</td>
                    <td className="px-4 py-3 text-ink/55">
                      {claim.method.replaceAll('_', ' ').toLowerCase()}
                      <span className="block text-[11.5px]">{claim.reference}</span>
                      {claim.comment && <span className="block text-[11.5px] italic">{claim.comment}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={claim.status} />
                      {claim.rejectionReason && <p className="mt-1 text-[11.5px] text-clay">{claim.rejectionReason}</p>}
                      {claim.creditPaisa > 0 && (
                        <p className="mt-1 text-[11.5px] text-ink/55">{formatPaisa(claim.creditPaisa)} becomes credit</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {claim.receiptAvailable && (
                          <button type="button" onClick={() => openReceipt(claim)} className="inline-flex items-center gap-1 text-[12px] font-medium text-forest hover:underline">
                            <Receipt className="h-3.5 w-3.5" /> Receipt
                          </button>
                        )}
                        {claim.status === 'SUBMITTED' && (
                          <>
                            <button type="button" onClick={() => openDecision(claim, 'VERIFIED')} className={btnPine}>
                              Verify
                            </button>
                            <button type="button" onClick={() => openDecision(claim, 'REJECTED')} className={btnGhost}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <Pager pagination={data.pagination} onPage={load} />
        </>
      )}

      {deciding && (
        <Modal
          open
          onClose={() => setDeciding(null)}
          title={decision === 'VERIFIED' ? 'Verify this payment' : 'Reject this payment'}
          maxWidth="max-w-md"
        >
          <form onSubmit={submitDecision} className="space-y-4">
            <p className="text-sm text-ink/80">
              {deciding.seller?.name} claims <strong>{formatPaisa(deciding.amountPaisa)}</strong> for invoice{' '}
              {deciding.invoice?.periodKey || '—'} ({deciding.method.replaceAll('_', ' ').toLowerCase()} · {deciding.reference}).
            </p>
            {decision === 'VERIFIED' ? (
              <p className="rounded-tile bg-sage/60 px-3 py-2 text-[13px] text-forest">
                The invoice is paid by {formatPaisa(Math.min(deciding.amountPaisa, deciding.invoice?.amountDuePaisa || 0))}.
                Any extra becomes credit on a later invoice.
              </p>
            ) : (
              <p className="rounded-tile bg-clay/10 px-3 py-2 text-[13px] text-clay">
                The seller keeps the balance and the reason below is shown on their billing page.
              </p>
            )}
            <div>
              <label htmlFor="decision-note" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
                {decision === 'VERIFIED' ? 'Note (optional)' : 'Reason (shown to the seller)'}
              </label>
              <textarea
                id="decision-note"
                rows={3}
                maxLength={500}
                className={`${inputClass} py-2.5`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                required={decision === 'REJECTED'}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDeciding(null)} className={btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={decision === 'REJECTED' ? btnGhost : btnPine}>
                {busy ? 'Saving…' : decision === 'VERIFIED' ? 'Verify payment' : 'Reject payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
