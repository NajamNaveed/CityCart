import { humanize } from '../ui'

const PROBLEM = new Set(['CANCELLED', 'REJECTED', 'FAILED', 'RETURNED', 'REFUNDED'])

// Neutral status label for the shopper side (the brand dashboard has its own pine badges).
export default function StatusPill({ value }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${
        PROBLEM.has(value) ? 'border-clay/40 bg-clay/10 text-clay' : 'border-line bg-sand text-ink'
      }`}
    >
      {humanize(value)}
    </span>
  )
}