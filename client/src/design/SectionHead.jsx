import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { accent, arrowLink, display, eyebrow, lede } from './tokens'

// Numbered landing section header: 01 — SHOP YOUR BLOCK, title + clay accent.
export default function SectionHead({ id, index, eyebrow: kicker, title, accent: accentText, lede: intro, to, linkLabel }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <p className={`flex items-center gap-2.5 ${eyebrow}`}>
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-clay/20 bg-clay/[0.06] text-[9px] font-bold tabular-nums text-clay">
            {index}
          </span>
          <span aria-hidden="true" className="h-px w-6 bg-gradient-to-r from-clay/50 to-gold/40" />
          {kicker}
        </p>
        <h2 id={id} className={`${display.md} mt-3`}>
          {title}{' '}
          {accentText && <em className={`whitespace-nowrap text-gradient ${accent}`}>{accentText}</em>}
        </h2>
        {intro && <p className={`mt-3 max-w-xl ${lede}`}>{intro}</p>}
      </div>
      {to && (
        <Link to={to} className={`group ${arrowLink}`}>
          {linkLabel}
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}
    </div>
  )
}
