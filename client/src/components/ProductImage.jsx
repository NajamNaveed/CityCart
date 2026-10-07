import { useState } from 'react'
import { optimizedUrl } from './optimizeImage'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function FallbackTile({ name, className }) {
  return (
    <div
      role="img"
      aria-label={name}
      className={`flex items-center justify-center overflow-hidden bg-sand text-4xl font-light tracking-[0.15em] text-clay/40 ${className}`}
    >
      {initials(name)}
    </div>
  )
}

/**
 * One photo, keyed by src from the outside — switching images remounts this
 * component, so loading state resets without any effect. A shimmer shows
 * until the photo has decoded, so grids never flash empty while loading.
 */
function LoadedImage({ src, name, className, width }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (failed) {
    return <FallbackTile name={name} className={className} />
  }
  return (
    <div className={`relative overflow-hidden bg-sand ${className}`}>
      {!loaded && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-line/50" />}
      <img
        ref={(node) => {
          // Cached images can finish before React attaches onLoad.
          if (node && node.complete && node.naturalWidth > 0) setLoaded(true)
        }}
        src={optimizedUrl(src, width)}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

/**
 * The product photo — or a quiet typographic tile when there is none. The
 * sizing/aspect classes passed via `className` land on the frame; the image
 * fills it.
 */
export default function ProductImage({ src, name, className = '', width = 900 }) {
  if (!src) {
    return <FallbackTile name={name} className={className} />
  }
  return <LoadedImage key={src} src={src} name={name} className={className} width={width} />
}
