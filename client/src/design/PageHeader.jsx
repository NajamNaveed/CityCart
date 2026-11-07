import { accent, display, eyebrow, lede } from './tokens'

// Interior page header: one h1, optional kicker, lede and right-aligned actions.
export default function PageHeader({ eyebrow: kicker, title, accent: accentText, lede: intro, actions, children, className = '' }) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-5 ${className}`.trim()}>
      <div className="max-w-2xl">
        {kicker && <p className={eyebrow}>{kicker}</p>}
        <h1 className={`${display.md} ${kicker ? 'mt-3' : ''}`}>
          {title} {accentText && <em className={`whitespace-nowrap ${accent}`}>{accentText}</em>}
        </h1>
        {intro && <p className={`mt-3 max-w-xl ${lede}`}>{intro}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  )
}
