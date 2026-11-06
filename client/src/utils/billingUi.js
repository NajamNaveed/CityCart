import { formatPrice } from '../ui'

// Seller billing vocabulary shared by the brand/provider page and the admin
// page. The server is authoritative for every amount; this file only formats.

export const BILLING_STATUS_COPY = {
  ACTIVE: {
    tone: 'ok',
    title: 'Billing is in good standing',
    message: 'Nothing is overdue. Your listings are live and customers can order.',
  },
  WARNING: {
    tone: 'warn',
    title: 'Your bill is due',
    message: 'Please pay from this page. Your listings stay live while the bill is due.',
  },
  RESTRICTED: {
    tone: 'danger',
    title: 'New orders are paused',
    message:
      'Your bill is 7 days overdue. Your listings are still visible but customers cannot place new orders. Existing orders and bookings must still be fulfilled.',
  },
  FROZEN: {
    tone: 'danger',
    title: 'Your listings are hidden',
    message:
      'Your bill is 14 days overdue. Customers cannot find you or place new orders. Pay the balance and the platform team will restore your listings.',
  },
}

export const CLAIM_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'JAZZCASH', label: 'JazzCash' },
  { value: 'EASYPAISA', label: 'Easypaisa' },
  { value: 'OTHER', label: 'Other' },
]

export const CLAIM_STATUS_OPTIONS = ['SUBMITTED', 'VERIFIED', 'REJECTED']

export const INVOICE_STATUS_OPTIONS = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']

export const BILLING_STATUS_OPTIONS = ['ACTIVE', 'WARNING', 'RESTRICTED', 'FROZEN']

export const SELLER_TYPE_OPTIONS = [
  { value: 'BRAND', label: 'Brand' },
  { value: 'SERVICE_PROVIDER', label: 'Service provider' },
]

/** Integer paisa -> PKR with two decimals. */
export function formatPaisa(paisa) {
  return formatPrice((Number(paisa) || 0) / 100)
}

/** "1,234.56" / "1234.5" -> 123456 paisa, or null when the text is not money. */
export function inputToPaisa(value) {
  const text = String(value ?? '').replace(/,/g, '').trim()
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

/** Paisa -> a plain "1234.56" input value (no currency symbol, no grouping). */
export function paisaToInput(paisa) {
  const value = Number(paisa) || 0
  return (value / 100).toFixed(2)
}

export function billingStatusCopy(status) {
  return BILLING_STATUS_COPY[status] || BILLING_STATUS_COPY.ACTIVE
}
