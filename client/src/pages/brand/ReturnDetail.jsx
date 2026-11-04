import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader, StatusBadge, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { useCan } from '../../hooks/useCan'
import { Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice } from '../../ui'
import { isReturnOpen, lineResultLabel, reasonLabel, receiveDecisions, returnUnits } from '../../utils/returns'

function SectionTitle({ children }) {
  return (
    <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
      {children}
    </h2>
  )
}

export default function ReturnDetail() {
  const { id } = useParams()
  const canManage = useCan()('delivery.manage')
  const [state, setState] = useState({ id: null, ret: null, error: '' })
  const [restock, setRestock] = useState({})
  const [links, setLinks] = useState({})
  const [photoBusy, setPhotoBusy] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  const fetchReturn = useCallback(
    () =>
      api.get(`/returns/${id}`).then(
        (res) => ({ id, ret: res.data.return, error: '' }),
        (err) => ({ id, ret: null, error: getErrorMessage(err) }),
      ),
    [id],
  )

  useEffect(() => {
    let active = true
    fetchReturn().then((next) => active && setState(next))
    return () => {
      active = false
    }
  }, [fetchReturn])

  async function showPhoto(index) {
    if (photoBusy !== null) return
    setPhotoBusy(index)
    setMessage({ text: '', tone: 'ok' })
    try {
      const res = await api.get(`/returns/${id}/photo`, { params: { line: index } })
      setLinks((current) => ({ ...current, [index]: res.data.url }))
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setPhotoBusy(null)
    }
  }

  async function receive() {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      const res = await api.post(`/returns/${id}/receive`, { decisions: receiveDecisions(state.ret.lines, restock) })
      const sellable = state.ret.lines.filter((_, index) => restock[index]).length
      setState({ id, ret: res.data.return, error: '' })
      setRestock({})
      setMessage({
        text: sellable
          ? `Received. ${sellable} ${sellable === 1 ? 'line is' : 'lines are'} back on the shelf.`
          : 'Received. Everything was written off.',
        tone: 'ok',
      })
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }

  if (state.id !== id) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (!state.ret) {
    return (
      <>
        <p className="text-clay">{state.error}</p>
        <Link to="/brand/returns" className="mt-4 inline-block text-sm font-medium text-pine hover:underline">
          Back to returned goods
        </Link>
      </>
    )
  }

  const ret = state.ret
  const open = isReturnOpen(ret.status)
  const units = returnUnits(ret)

  return (
    <>
      <Link to="/brand/returns" className="inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All returned goods
      </Link>

      <PageHeader
        title={ret.orderNumber || 'Returned goods'}
        intro={`${units} ${units === 1 ? 'item' : 'items'} from an order delivered at the door.`}
        action={<StatusBadge value={ret.status} />}
      />

      <Notice tone={message.tone}>{message.text}</Notice>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Goods coming back</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{formatPrice(ret.returnedSubtotal)}</p>
          {ret.feeRefunded ? <p className="mt-0.5 text-xs text-muted">The delivery fee was refunded too.</p> : null}
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Refunded to the customer</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{formatPrice(ret.refundAmount)}</p>
          <p className="mt-0.5 text-xs text-muted">Prepaid orders only.</p>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Received</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{ret.receivedAt ? formatDateTime(ret.receivedAt) : 'Not yet'}</p>
          <Link to={`/brand/orders/${ret.orderId}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-pine hover:underline">
            View the order
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <section className="mb-6">
        <div className="mb-2 px-1">
          <SectionTitle>What came back</SectionTitle>
        </div>
        <div className={tableShell}>
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className={tableHead}>
                <th className="px-5 py-3 font-medium">Item</th>
                <th className="py-3 pr-4 font-medium">Quantity</th>
                <th className="py-3 pr-4 font-medium">Unit price</th>
                <th className="py-3 pr-4 font-medium">Why</th>
                <th className="py-3 pr-4 font-medium">Photo</th>
                <th className="py-3 pr-5 font-medium">{open && canManage ? 'Sellable?' : 'Result'}</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((line, index) => (
                <tr key={line.orderItemId || index} className={tableRow}>
                  <td className="px-5 py-3.5 font-medium text-ink">{line.productName}</td>
                  <td className="py-3.5 pr-4 text-ink">{line.quantity}</td>
                  <td className="py-3.5 pr-4 text-ink">{formatPrice(line.unitPrice)}</td>
                  <td className="py-3.5 pr-4 text-ink">{reasonLabel(line.reason)}</td>
                  <td className="py-3.5 pr-4">
                    {!line.hasPhoto ? (
                      <span className="text-muted">—</span>
                    ) : links[index] ? (
                      <a href={links[index]} target="_blank" rel="noreferrer" className="font-medium text-pine hover:underline">
                        Open photo
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => showPhoto(index)}
                        disabled={photoBusy !== null}
                        className="font-medium text-pine hover:underline disabled:opacity-50"
                      >
                        {photoBusy === index ? 'Loading…' : 'Show photo'}
                      </button>
                    )}
                  </td>
                  <td className="py-3.5 pr-5 text-ink">
                    {open && canManage ? (
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(restock[index])}
                          onChange={() => setRestock((current) => ({ ...current, [index]: !current[index] }))}
                          disabled={busy}
                          className="h-4 w-4 rounded border-line accent-pine"
                        />
                        <span>{restock[index] ? 'Restock' : 'Write off'}</span>
                      </label>
                    ) : (
                      <span className={line.restock ? 'text-success' : 'text-muted'}>{lineResultLabel(line)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        canManage ? (
          <div className="rounded-lg border border-line bg-white px-5 py-4">
            <SectionTitle>Take the goods in</SectionTitle>
            <p className="mt-3 text-sm text-muted">
              Tick the goods that can be sold again. Everything else is written off. Stock only changes now, when you take the goods in.
            </p>
            <button type="button" onClick={receive} disabled={busy} className="mt-4 inline-flex h-10 items-center rounded-md bg-pine px-5 text-[12px] font-medium uppercase tracking-[0.08em] text-white transition hover:bg-pine-dark disabled:opacity-50">
              {busy ? 'Receiving…' : 'Mark received'}
            </button>
            <p className="mt-2 text-xs text-muted">This can only be done once.</p>
          </div>
        ) : (
          <p className="text-sm text-muted">You can see this return but cannot take the goods in.</p>
        )
      ) : null}
    </>
  )
}
