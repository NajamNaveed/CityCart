import { useState } from 'react'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// Shows the product photo, or a quiet typographic tile when there is none.
export default function ProductImage({ src, name, className = '' }) {
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
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  )
}