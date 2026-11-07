import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

export default function SectionHead({ id, index, eyebrow, title, accent, lede, to, linkLabel }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/45">
          <span className="text-clay">{index}</span>
          <span aria-hidden="true" className="h-px w-6 bg-line-warm" />
          {eyebrow}
        </p>
        <h2
          id={id}
          className="font-display mt-3 text-[30px] font-semibold leading-[1.04] tracking-[-0.02em] text-ink sm:text-[40px]"
        >
          {title} {accent && <em className="whitespace-nowrap font-normal italic text-clay">{accent}</em>}
        </h2>
        {lede && <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink/60 sm:text-[15px]">{lede}</p>}
      </div>
      {to && (
        <Link
          to={to}
          className="inline-flex shrink-0 items-center gap-1.5 border-b border-ink/20 pb-1 text-[12.5px] font-medium text-ink/75 transition hover:border-ink hover:text-ink"
        >
          {linkLabel}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
