import { File } from 'expo-file-system'
import api from './api'

/**
 * The rider's own deliveries (docs/20, /api/v1/rider/deliveries). The server
 * only ever answers with deliveries assigned to the signed-in rider.
 */
export const DELIVERIES_PAGE_SIZE = 20

export async function fetchDeliveries(scope = 'active', page = 1) {
  const res = await api.get('/rider/deliveries', { params: { scope, page, limit: DELIVERIES_PAGE_SIZE } })
  return { items: res.data.deliveries || [], pagination: res.data.pagination }
}

export async function fetchDelivery(id) {
  const res = await api.get(`/rider/deliveries/${id}`)
  return res.data.delivery
}

// PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY or FAILED (a reason is required for FAILED).
export async function setDeliveryStatus(id, status, failureReason) {
  const res = await api.patch(`/rider/deliveries/${id}/status`, { status, ...(failureReason && { failureReason }) })
  return res.data.delivery
}

// The only way a rider marks a delivery as delivered: with the customer's six-digit code.
// A non-cash payment at the door carries how it was paid, the reference and the photo.
export async function completeDelivery(id, code, collection) {
  const res = await api.post(`/rider/deliveries/${id}/complete`, { code, ...(collection && { collection }) })
  return res.data.delivery
}

// Step one of a non-cash payment: a signature for THIS delivery's private folder.
export async function requestProofUpload(deliveryId) {
  const res = await api.post(`/rider/deliveries/${deliveryId}/proof-upload`)
  return res.data.upload
}

/**
 * Straight to Cloudinary, not through our API: the signature is for one private
 * folder and the photo never touches our server. `type: authenticated` is signed,
 * so it must be sent as a field; the same for the rest of the signed fields.
 *
 * Expo SDK 57's global fetch is expo/fetch, which reads a FormData file as bytes.
 * React Native's older `{ uri, name, type }` part is rejected before anything is
 * sent, so the photo is wrapped in expo-file-system's File (a Blob with a name
 * and MIME type), which both expo/fetch and React Native's fetch understand.
 */
export async function uploadPaymentProof(upload, asset) {
  if (!asset?.uri) {
    throw Object.assign(new Error('PROOF_FILE_MISSING'), {
      codeMessage: 'The photo is no longer on the phone. Take it again.',
    })
  }
  const file = new File(asset.uri)
  if (!file.exists) {
    throw Object.assign(new Error('PROOF_FILE_MISSING'), {
      codeMessage: 'The photo is no longer on the phone. Take it again.',
    })
  }

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', upload.apiKey)
  form.append('timestamp', String(upload.timestamp))
  form.append('signature', upload.signature)
  form.append('folder', upload.folder)
  form.append('allowed_formats', upload.allowedFormats)
  form.append('type', upload.type)

  let res
  try {
    res = await fetch(upload.uploadUrl, { method: 'POST', body: form })
  } catch {
    // A network failure has no HTTP response: say so plainly instead of the
    // generic "cannot reach the server", which belongs to our own API.
    throw Object.assign(new Error('UPLOAD_NETWORK'), {
      codeMessage: "The photo could not be uploaded. Check the phone's internet connection and try again.",
    })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.public_id) {
    const reason = data?.error?.message
    throw Object.assign(new Error('UPLOAD_FAILED'), {
      status: res.status,
      codeMessage: reason
        ? `The photo service did not accept the photo (${res.status}: ${reason}). Take it again.`
        : 'The photo could not be uploaded. Take it again.',
    })
  }
  // Cloudinary's etag is the image hash: the server uses it to spot a reused photo.
  return { publicId: data.public_id, fingerprint: data.etag || data.public_id }
}

// The cash this rider holds: collected on delivery, not yet handed to the brand.
export async function fetchCash() {
  const res = await api.get('/rider/deliveries/cash')
  return res.data.cash
}
