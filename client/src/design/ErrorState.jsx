import { RotateCcw, TriangleAlert } from 'lucide-react'
import Button from './Button'
import { stateIcon, statePanel } from './tokens'

export default function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) {
  return (
    <div className={`${statePanel} ${className}`.trim()} role="alert">
      <span className={`${stateIcon} text-clay`}>
        <TriangleAlert className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="font-display mt-4 text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
      {message && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink/60">{message}</p>}
      {onRetry && (
        <Button tone="outline" size="sm" onClick={onRetry} className="mt-5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
