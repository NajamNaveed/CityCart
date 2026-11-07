import { humanize } from '../ui'

const PROBLEM = new Set(['CANCELLED', 'REJECTED', 'FAILED', 'RETURNED', 'REFUNDED', 'DECLINED', 'DISPUTED'])

// Neutral status label for the shopper side (the brand dashboard has its own pine badges).
export default function StatusPill({ value }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        PROBLEM.has(value) ? 'border-clay/25 bg-clay/5 text-clay' : 'border-line-warm bg-paper-warm text-ink/70'
      }`}
    >
      {humanize(value)}
    </span>
  )
}
