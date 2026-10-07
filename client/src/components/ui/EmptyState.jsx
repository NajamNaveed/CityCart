/**
 * Quiet message for empty lists and dead ends: icon, headline, one line of
 * guidance, and an optional action node.
 */
export default function EmptyState({ icon: Icon, title, message, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}>
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sand text-muted">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <h2 className="font-display mt-4 text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {message && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
