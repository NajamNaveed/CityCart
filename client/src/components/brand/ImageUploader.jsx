import { useRef, useState } from 'react'
import { getErrorMessage } from '../../services/api'
import { ACCEPTED_TYPES, MAX_IMAGES, checkImageFile, uploadProductImage } from '../../services/uploads'
import ProductImage from '../ProductImage'
import { inputClass } from '../../ui'

/**
 * Product photo manager: upload files (click or drag them in), add an image by link,
 * choose the main photo, remove photos. The first image is the main one.
 */
export default function ImageUploader({ images, onChange, name = 'product' }) {
  const fileInput = useRef(null)
  const [uploads, setUploads] = useState([]) // [{ id, name, progress, error }]
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState(false)
  const [link, setLink] = useState('')

  const busy = uploads.some((u) => !u.error)
  const room = MAX_IMAGES - images.length

  const patchUpload = (id, patch) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  async function addFiles(fileList) {
    const files = [...fileList]
    if (files.length === 0) return
    setMessage('')

    if (files.length > room) {
      setMessage(`You can have up to ${MAX_IMAGES} photos. ${room > 0 ? `Only the first ${room} will be added.` : 'Remove one to add another.'}`)
    }

    // Upload one after another and add each to the list as soon as it is done.
    let current = images
    for (const file of files.slice(0, Math.max(room, 0))) {
      const id = `${file.name}-${file.size}-${Date.now()}`
      const problem = checkImageFile(file)
      setUploads((list) => [...list, { id, name: file.name, progress: 0, error: problem }])
      if (problem) continue

      try {
        const url = await uploadProductImage(file, (p) => patchUpload(id, { progress: p }))
        current = [...current, url]
        onChange(current)
        setUploads((list) => list.filter((u) => u.id !== id))
      } catch (err) {
        const text = err.response ? getErrorMessage(err) : err.message
        patchUpload(id, { error: text })
        if (err.response?.status === 503) setMessage('Image upload is not set up on this server yet. You can add images by link below.')
      }
    }
  }

  function addLink(e) {
    e.preventDefault()
    const url = link.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setMessage('An image link must start with http:// or https://')
      return
    }
    if (images.includes(url)) {
      setMessage('That image is already on this product.')
      return
    }
    if (room <= 0) {
      setMessage(`You can have up to ${MAX_IMAGES} photos.`)
      return
    }
    setMessage('')
    onChange([...images, url])
    setLink('')
  }

  const makeMain = (index) => onChange([images[index], ...images.filter((_, i) => i !== index)])
  const remove = (index) => onChange(images.filter((_, i) => i !== index))

  return (
    <div>
      {images.length > 0 && (
        <ul className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {images.map((src, index) => (
            <li key={src}>
              <div className="relative overflow-hidden bg-sand">
                <ProductImage src={src} name={name} className="aspect-square w-full" />
                {index === 0 && (
                  <span className="absolute left-2 top-2 bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-cream">Main</span>
                )}
              </div>
              <div className="mt-2 flex justify-between text-[12px] font-medium">
                {index === 0 ? (
                  <span className="text-muted">Main photo</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => makeMain(index)} className="text-pine hover:underline disabled:text-muted">
                    Make main
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => remove(index)} className="text-clay hover:underline disabled:text-muted">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        className={`rounded-lg border border-dashed px-5 py-8 text-center transition ${
          dragging ? 'border-pine bg-pine/5' : 'border-line bg-paper'
        }`}
      >
        <p className="text-sm text-ink">Drag photos here, or</p>
        <button
          type="button"
          disabled={room <= 0}
          onClick={() => fileInput.current?.click()}
          className="mt-2 text-[13px] font-medium text-pine underline underline-offset-4 hover:no-underline disabled:text-muted disabled:no-underline"
        >
          choose from your computer
        </button>
        <p className="mt-2 text-xs text-muted">
          JPG, PNG or WebP, up to 5 MB each. {images.length} of {MAX_IMAGES} photos.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="sr-only"
          aria-label="Choose product photos"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = '' // lets the same file be chosen again
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate">{u.name}</span>
              {u.error ? (
                <span className="flex shrink-0 items-center gap-3 text-clay">
                  {u.error}
                  <button type="button" onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))} className="text-muted hover:underline">
                    Dismiss
                  </button>
                </span>
              ) : (
                <span className="shrink-0 text-muted">{Math.round(u.progress * 100)}%</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p role="status" className="mt-4 border-l-2 border-line bg-sand px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <form onSubmit={addLink} className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="image-link" className="sr-only">
          Add an image by link
        </label>
        <input id="image-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Or paste a link to an image" className={`h-10 min-w-0 flex-1 basis-60 ${inputClass}`} />
        <button type="submit" className="text-[13px] font-medium text-pine hover:underline">
          Add link
        </button>
      </form>
    </div>
  )
}