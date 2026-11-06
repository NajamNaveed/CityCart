import { useCallback, useEffect, useState } from 'react'
import { CircleHelp, MessageSquare } from 'lucide-react'
import api, { getErrorMessage } from '../../../services/api'
import { EmptyState, Modal, Skeleton, toast } from '../../../components/ui'
import { Pager, StatusBadge, selectClass, tableHead, tableRow, tableShell } from '../../../components/brand/Bits'
import { btnGhost, btnPine, formatDateTime, inputClass } from '../../../ui'

const STATUS_OPTIONS = ['OPEN', 'RESOLVED']

export default function HelpTab() {
  const [status, setStatus] = useState('OPEN')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answering, setAnswering] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (nextPage = 1) => {
      setLoading(true)
      setError('')
      try {
        const { data: body } = await api.get('/admin/billing/help', {
          params: { page: nextPage, limit: 20, ...(status && { status }) },
        })
        setData({ items: body.requests, pagination: body.pagination })
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

  function openAnswer(request) {
    setAnswering(request)
    setNote('')
    setBusy(false)
  }

  async function submitAnswer(event) {
    event.preventDefault()
    if (note.trim().length < 3) {
      toast('Write a short answer for the seller.', { type: 'error' })
      return
    }
    setBusy(true)
    try {
      const { data: body } = await api.post(`/admin/billing/help/${answering._id}/resolve`, {
        note: note.trim(),
      })
      toast(body.message, { type: 'success' })
      setAnswering(null)
      load(page)
    } catch (err) {
      toast(getErrorMessage(err), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Request status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All requests</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'OPEN' ? 'Open' : 'Resolved'}
            </option>
          ))}
        </select>
        <p className="text-[12.5px] text-muted">
          Answers appear on the seller's billing page and in their notifications.
        </p>
      </div>

      {error && <p className="mb-4 rounded-md bg-clay/5 px-3 py-2 text-sm text-clay">{error}</p>}

      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <>
          <div className={tableShell}>
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={CircleHelp}
                        title={status === 'OPEN' ? 'No open questions' : 'Nothing here'}
                        message="Billing questions from sellers appear here."
                      />
                    </td>
                  </tr>
                ) : (
                  data.items.map((request) => (
                    <tr key={request._id} className={tableRow}>
                      <td className="px-4 py-3 align-top text-muted">{formatDateTime(request.createdAt)}</td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-ink">{request.seller?.name || 'Unknown seller'}</span>
                        <span className="block text-[11.5px] text-muted">
                          {request.sellerType === 'BRAND' ? 'Brand' : 'Service provider'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-ink">{request.subject}</p>
                        <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-muted">{request.message}</p>
                        {request.resolutionNote && (
                          <p className="mt-1.5 rounded-md bg-paper px-2.5 py-1.5 text-[12px] text-ink">
                            <span className="font-medium">Answered: </span>
                            {request.resolutionNote}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge value={request.status} />
                        {request.handledAt && (
                          <span className="mt-1 block text-[11.5px] text-muted">{formatDateTime(request.handledAt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {request.status === 'OPEN' && (
                          <button type="button" onClick={() => openAnswer(request)} className={btnGhost}>
                            <MessageSquare className="h-4 w-4" aria-hidden="true" /> Answer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager pagination={data.pagination} onPage={load} />
        </>
      )}

      {answering && (
        <Modal open onClose={() => setAnswering(null)} title="Answer the seller" maxWidth="max-w-lg">
          <form onSubmit={submitAnswer} className="space-y-4">
            <div className="rounded-md bg-paper/70 px-3 py-2.5">
              <p className="text-sm font-medium text-ink">{answering.subject}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{answering.message}</p>
            </div>
            <div>
              <label htmlFor="help-answer" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
                Your answer
              </label>
              <textarea
                id="help-answer"
                rows={4}
                maxLength={1000}
                className={`${inputClass} py-2.5`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAnswering(null)} className={btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={btnPine}>
                {busy ? 'Sending…' : 'Send answer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
