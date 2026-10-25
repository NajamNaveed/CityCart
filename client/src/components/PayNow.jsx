import { useState } from 'react'
import api, { getErrorMessage } from '../services/api'
import { btnPrimary } from '../ui'

/**
 * "Pay now" for an order paid online. Asks the server for the gateway page of THIS order
 * (the server checks the order is yours and still waiting for payment) and sends the
 * browser there. Nothing is marked paid here: only the gateway's confirmation does that.
 */
export default function PayNow({ orderId, label = 'Pay now', className = '' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    setBusy(true)
    setError('')
    try {
      const res = await api.post(`/payments/order/${orderId}/checkout`)
      window.location.assign(res.data.checkoutUrl)
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={start} disabled={busy} className={btnPrimary}>
        {busy ? 'Opening payment…' : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-clay">
          {error}
        </p>
      )}
    </div>
  )
}
