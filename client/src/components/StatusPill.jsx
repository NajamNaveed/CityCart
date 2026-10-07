import { humanize } from '../ui'

const PROBLEM = new Set(['CANCELLED', 'REJECTED', 'FAILED', 'RETURNED', 'REFUNDED'])

// Neutral status label for the shopper side (the brand dashboard has its own pine badges).
export default function StatusPill({ value }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${
        PROBLEM.has(value) ? 'border-clay/30 bg-clay/5 text-clay' : 'border-line bg-paper text-ink'
      }`}
    >
      {humanize(value)}
    </span>
  )
}
