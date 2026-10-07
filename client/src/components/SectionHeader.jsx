import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function SectionHeader({ eyebrow, title, to, linkLabel }) {
  return (
    <div className="mb-7">
      {(eyebrow || to) && (
        <div className="mb-2 flex items-center justify-between">
          {eyebrow && <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-clay">{eyebrow}</p>}
          {to && (
            <Link
              to={to}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink/70 underline-offset-4 transition hover:text-ink hover:underline"
            >
              {linkLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h2>
    </div>
  )
}
