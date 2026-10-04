import { useState } from 'react'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// Photos hosted on Cloudinary are served resized and in the best format for the browser.
// Only plain upload addresses (version segment right after /upload/) are rewritten; any other
// address is used exactly as given.
const CLOUDINARY_PLAIN = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/

function optimized(src, width) {
  const match = CLOUDINARY_PLAIN.exec(src)
  return match ? `${match[1]}c_limit,w_${width},f_auto,q_auto/${match[2]}` : src
}

// Shows the product photo, or a quiet typographic tile when there is none.
export default function ProductImage({ src, name, className = '', width = 900 }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={name}
        className={`flex items-center justify-center bg-sand text-4xl font-light tracking-[0.15em] text-clay/45 ${className}`}
      >
        {initials(name)}
      </div>
    )
  }
  return (
    <img
      src={optimized(src, width)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  )
}