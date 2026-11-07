import { stateIcon, statePanel } from './tokens'

// Quiet dead end: icon, headline, one line of guidance and an optional action.
export default function EmptyState({ icon: Icon, title, message, action, className = '' }) {
  return (
    <div className={`${statePanel} ${className}`.trim()}>
      {Icon && (
        <span className={stateIcon}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <h2 className="font-display mt-4 text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
      {message && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink/60">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
