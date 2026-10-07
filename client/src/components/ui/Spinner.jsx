import { Loader2 } from 'lucide-react'

export default function Spinner({ className = '', label }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status">
      <Loader2 className={`h-4 w-4 animate-spin ${className}`} aria-hidden="true" />
      {label && <span className="text-[13px]">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  )
}
