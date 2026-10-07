// A shimmering placeholder block. Compose grids of these while data loads.
export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-line/60 ${className}`} />
}
