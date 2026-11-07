import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { accent, arrowLink, display, eyebrow, lede } from './tokens'

// Numbered landing section header: 01 — SHOP YOUR BLOCK, title + clay accent.
export default function SectionHead({ id, index, eyebrow: kicker, title, accent: accentText, lede: intro, to, linkLabel }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <p className={`flex items-center gap-2.5 ${eyebrow}`}>
          <span className="text-clay">{index}</span>
          <span aria-hidden="true" className="h-px w-6 bg-line-warm" />
          {kicker}
        </p>
        <h2 id={id} className={`${display.md} mt-3`}>
          {title} {accentText && <em className={`whitespace-nowrap ${accent}`}>{accentText}</em>}
        </h2>
        {intro && <p className={`mt-3 max-w-xl ${lede}`}>{intro}</p>}
      </div>
      {to && (
        <Link to={to} className={arrowLink}>
          {linkLabel}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
