import { useMemo, useState } from 'react'
import { PencilLine, RefreshCw } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Notice, StatusBadge } from './Bits'
import { Modal, Spinner } from '../ui'
import { btnOutline, btnPine, formatDateTime, formatPrice, inputClass } from '../../ui'

const ADJUSTABLE = ['PENDING', 'CONFIRMED', 'PROCESSING']

const lineText = (line) => {
  const supplied = `${line.supplyQuantity} of ${line.orderedQuantity} × ${line.productName}`
  if (!line.substitute) return `${supplied} — the rest removed`
  return `${supplied}, plus ${line.substitute.quantity} × ${line.substitute.productName} instead`
}

const emptyForm = (items) =>
  Object.fromEntries(
    items.map((item, index) => [index, { affected: false, supplyQuantity: item.quantity, mode: 'REMOVE', substituteId: '' }]),
  )

export default function AdjustmentPanel({ order, adjustments = [], adjustment, canAdjust, onChanged }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(order.items))
  const [note, setNote] = useState('')
  const [restock, setRestock] = useState(false)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [productError, setProductError] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  const active = adjustment?.status === 'PROPOSED' ? adjustment : null
  const history = adjustments.filter((a) => a.status !== 'PROPOSED')
  const onlineUnpaid = order.paymentMethod === 'ONLINE_GATEWAY' && order.paymentStatus !== 'PAID'
  const canPropose = canAdjust && !active && ADJUSTABLE.includes(order.orderStatus) && !onlineUnpaid

  async function loadProducts() {
    setLoading(true)
    setProductError('')
    try {
      const res = await api.get('/products', { params: { brandId: order.brandId, limit: 50 } })
      setProducts(res.data.products || [])
    } catch (err) {
      setProductError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function openForm() {
    setForm(emptyForm(order.items))
    setNote('')
    setRestock(false)
    setError('')
    setResult('')
    setOpen(true)
    loadProducts()
  }

  function toggleLine(index) {
    setForm((current) => {
      const line = current[index]
      const item = order.items[index]
      return {
        ...current,
        [index]: line.affected
          ? { ...line, affected: false, supplyQuantity: item.quantity, mode: 'REMOVE', substituteId: '' }
          : { ...line, affected: true, supplyQuantity: Math.max(0, item.quantity - 1) },
      }
    })
  }

  function patchLine(index, patch) {
    setForm((current) => ({ ...current, [index]: { ...current[index], ...patch } }))
  }

  const affectedLines = order.items
    .map((item, index) => ({ item, index, line: form[index] }))
    .filter(({ item, line }) => line.affected && Number(line.supplyQuantity) < item.quantity)

  const substituteChoices = (item) =>
    products.filter((p) => String(p._id) !== String(item.productId) && p.availability !== 'OUT_OF_STOCK')

  const anyRemoved = affectedLines.some(({ line }) => line.mode === 'REMOVE')

  const preview = useMemo(() => {
    const byId = new Map(products.map((p) => [String(p._id), p]))
    let after = 0
    let removal = 0
    order.items.forEach((item, index) => {
      const line = form[index]
      const missing = item.quantity - Number(line?.supplyQuantity || 0)
      if (!line?.affected || missing <= 0) {
        after += item.totalPrice
        removal += item.totalPrice
        return
      }
      const supplied = item.unitPrice * Number(line.supplyQuantity)
      removal += supplied
      const substitute = line.mode === 'SUBSTITUTE' ? byId.get(String(line.substituteId)) : null
      after += supplied + (substitute ? substitute.price * missing : 0)
    })
    const withCharges = (subtotal) => subtotal + order.deliveryFee - order.discount + order.tax
    return { after: withCharges(after), removal: withCharges(removal) }
  }, [form, order, products])

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (!note.trim()) {
      setError('Add a short note so the customer understands why the order has to change.')
      return
    }
    if (affectedLines.length === 0) {
      setError('Tick at least one item and say how many units you can send.')
      return
    }
    if (affectedLines.some(({ line }) => line.mode === 'SUBSTITUTE' && !line.substituteId)) {
      setError('Choose a substitute product for every item you cannot complete.')
      return
    }

    const lines = affectedLines.map(({ item, line }) => {
      const missing = item.quantity - Number(line.supplyQuantity)
      return {
        orderItemId: item._id,
        supplyQuantity: Number(line.supplyQuantity),
        ...(line.mode === 'SUBSTITUTE' && { substitute: { productId: line.substituteId, quantity: missing } }),
      }
    })

    setBusy(true)
    try {
      await api.post(`/brand/orders/${order._id}/adjustments`, {
        note: note.trim(),
        restockRemoved: anyRemoved && restock,
        lines,
      })
      setOpen(false)
      setResult('The change proposal was sent. The order will stay as it is unless the customer answers.')
      await onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    setBusy(true)
    setError('')
    try {
      await api.post(`/brand/orders/${order._id}/adjustments/${active._id}/withdraw`)
      setConfirmWithdraw(false)
      setResult('The proposal was withdrawn and the order is unchanged.')
      await onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Notice tone="ok">{result}</Notice>
      {error && !open && <Notice tone="warn">{error}</Notice>}

      {active && (
        <section className="mb-8 rounded-lg border border-warning/40 bg-warning-soft/50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Waiting for the customer</h2>
              <p className="mt-1 text-[13px] text-muted">
                Sent {formatDateTime(active.createdAt)} · expires {formatDateTime(active.expiresAt)}
              </p>
            </div>
            <StatusBadge value={active.status} />
          </div>
          <p className="mt-3 text-sm text-ink/90">{active.note}</p>
          <ul className="mt-3 space-y-1 text-sm text-ink/90">
            {active.lines.map((line) => (
              <li key={String(line.orderItemId)}>• {lineText(line)}</li>
            ))}
          </ul>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div>
              <dt className="inline text-muted">If they accept: </dt>
              <dd className="inline font-semibold text-ink">{formatPrice(active.totalsAfter.total)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">If they keep only what you send: </dt>
              <dd className="inline font-semibold text-ink">{formatPrice(active.totalsAfterRemoval.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13px] text-muted">
            Nothing changes unless the customer answers. If they do not answer within 24 hours, the proposal expires and
            the order stays as it is.
          </p>
          {canAdjust && (
            <div className="mt-4">
              {confirmWithdraw ? (
                <span className="flex flex-wrap items-center gap-3 rounded-md bg-white px-3.5 py-2 text-sm">
                  <span className="text-ink">Withdraw the proposal?</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={withdraw}
                    className="inline-flex h-8 items-center rounded-md bg-danger px-3 text-[12.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    Yes, withdraw
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmWithdraw(false)}
                    className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[12.5px] font-medium text-ink transition hover:border-ink"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmWithdraw(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-4 text-[12.5px] font-medium text-ink transition hover:border-ink disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Withdraw proposal
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {canPropose && (
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-white p-5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <PencilLine className="h-4 w-4 text-pine" aria-hidden="true" />
              Cannot supply everything?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Offer a same-brand substitute or remove the items you cannot send. You will see the new total before sending,
              and the customer decides what happens.
            </p>
          </div>
          <button type="button" onClick={openForm} className={btnPine}>
            Propose a change
          </button>
        </section>
      )}

      {canAdjust && !active && ADJUSTABLE.includes(order.orderStatus) && onlineUnpaid && (
        <p className="mb-8 rounded-md bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          This order has not been paid online yet, so it cannot be changed. Wait for the payment to be confirmed.
        </p>
      )}

      {history.length > 0 && (
        <section className="mb-8">
          <h2 className="border-b border-line pb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            Previous change proposals
          </h2>
          <ul className="mt-3 space-y-2">
            {history.slice(0, 5).map((item) => (
              <li key={item._id} className="rounded-lg border border-line bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusBadge value={item.status} />
                    <span className="text-[13px] text-muted">{formatDateTime(item.respondedAt || item.createdAt)}</span>
                  </span>
                  <span className="text-[13px] text-muted">
                    {formatPrice(item.totalsBefore.total)} → {formatPrice(item.totalsAfter.total)}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] text-ink/90">{item.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Propose a change" maxWidth="max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm text-muted">
            Tick the items you cannot supply in full. The customer can accept what you can send, take only that much, or
            cancel the whole order.
          </p>

          {loading && <Spinner label="Loading your products…" />}
          {productError && <Notice tone="warn">{productError}</Notice>}

          <ul className="space-y-3">
            {order.items.map((item, index) => {
              const line = form[index]
              const missing = item.quantity - Number(line.supplyQuantity)
              const choices = substituteChoices(item)
              return (
                <li
                  key={item._id || `${item.productId}-${index}`}
                  className={`rounded-lg border p-4 ${line.affected ? 'border-pine/40 bg-paper/40' : 'border-line'}`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-pine"
                      checked={line.affected}
                      onChange={() => toggleLine(index)}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink">{item.productName}</span>
                      <span className="block text-[13px] text-muted">
                        {item.quantity} ordered at {formatPrice(item.unitPrice)} each
                      </span>
                    </span>
                  </label>

                  {line.affected && (
                    <div className="mt-3 space-y-3 border-t border-line pt-3 pl-7">
                      <label className="flex flex-wrap items-center gap-2.5 text-sm text-ink">
                        Units you can send
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={line.supplyQuantity}
                          onChange={(e) =>
                            patchLine(index, {
                              supplyQuantity: Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0)),
                            })
                          }
                          className={`${inputClass} h-9 w-24`}
                        />
                        <span className="text-muted">of {item.quantity}</span>
                      </label>

                      {missing > 0 && (
                        <>
                          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`mode-${index}`}
                                className="accent-pine"
                                checked={line.mode === 'REMOVE'}
                                onChange={() => patchLine(index, { mode: 'REMOVE', substituteId: '' })}
                              />
                              Remove the {missing} you cannot send
                            </label>
                            <label className={`flex items-center gap-2 ${choices.length ? '' : 'text-muted'}`}>
                              <input
                                type="radio"
                                name={`mode-${index}`}
                                className="accent-pine"
                                disabled={!choices.length}
                                checked={line.mode === 'SUBSTITUTE'}
                                onChange={() => patchLine(index, { mode: 'SUBSTITUTE' })}
                              />
                              Send a substitute instead
                            </label>
                          </div>
                          {line.mode === 'SUBSTITUTE' &&
                            (productError || (!loading && choices.length === 0) ? (
                              <p className="text-[13px] text-warning">
                                No other active product is in stock, so this item can only be removed.
                              </p>
                            ) : (
                              <select
                                value={line.substituteId}
                                onChange={(e) => patchLine(index, { substituteId: e.target.value })}
                                className={`${inputClass} h-10`}
                              >
                                <option value="">Choose a product…</option>
                                {choices.map((product) => (
                                  <option key={product._id} value={product._id}>
                                    {product.name} — {formatPrice(product.price)}
                                    {product.availability === 'LOW_STOCK' ? ' (low stock)' : ''}
                                  </option>
                                ))}
                              </select>
                            ))}
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Message to the customer</span>
            <textarea
              rows="3"
              maxLength="500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputClass} py-2.5`}
              placeholder="Explain what happened and what you can offer."
              required
            />
            <span className="mt-1 block text-right text-[12px] text-muted">{note.length}/500</span>
          </label>

          {anyRemoved && (
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-pine" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              <span>
                Put the units I cannot send back into stock
                <span className="block text-[12.5px] text-muted">Leave this off if they are damaged or missing.</span>
              </span>
            </label>
          )}

          <div className="rounded-lg bg-paper p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted">Order total now</span>
              <span className="text-ink">{formatPrice(order.total)}</span>
            </div>
            <div className="mt-1.5 flex justify-between gap-4">
              <span className="text-muted">If they accept the change</span>
              <span className="font-semibold text-ink">{formatPrice(preview.after)}</span>
            </div>
            <div className="mt-1.5 flex justify-between gap-4">
              <span className="text-muted">If they take only what you can send</span>
              <span className="font-semibold text-ink">{formatPrice(preview.removal)}</span>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">
              Delivery and discounts stay the same. The server recalculates the final total when the customer answers.
            </p>
          </div>

          {error && <Notice tone="warn">{error}</Notice>}

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className={btnOutline}>
              Cancel
            </button>
            <button type="submit" disabled={busy || loading} className={btnPine}>
              {busy ? 'Sending…' : 'Send proposal'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
