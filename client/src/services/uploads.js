import axios from 'axios'
import api from './api'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES = 10
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Returns a message when the file cannot be uploaded, or '' when it is fine.
export function checkImageFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG or WebP images can be uploaded.`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: the image is larger than 5 MB.`
  return ''
}

/**
 * Uploads one image straight from the browser to Cloudinary.
 * 1. Our server (which holds the API secret) signs the upload for this brand's folder.
 * 2. The browser sends the file to Cloudinary with that signature. This request must NOT carry
 *    our login cookie, so it uses the plain axios instance rather than the `api` one.
 * Resolves with the image's public https address.
 */
export async function uploadProductImage(file, onProgress) {
  const { data } = await api.post('/uploads/signature')
  const sig = data.upload

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', String(sig.timestamp))
  form.append('folder', sig.folder)
  form.append('allowed_formats', sig.allowedFormats)
  form.append('signature', sig.signature)

  try {
    const res = await axios.post(sig.uploadUrl, form, {
      onUploadProgress: (e) => e.total && onProgress?.(e.loaded / e.total),
    })
    return res.data.secure_url
  } catch (err) {
    throw new Error(err.response?.data?.error?.message || 'The upload failed. Check your connection and try again.')
  }
}