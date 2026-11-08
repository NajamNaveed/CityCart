import { useId } from 'react'
import { inputClass } from '../ui'

// `error` (clay) wins over `hint` (any node, e.g. "Available"). The hint and
// error are associated with the input so screen readers announce them.
export default function Field({ label, id, error, hint, ...inputProps }) {
  const autoId = useId()
  const fieldId = id || autoId
  const errorId = error ? `${fieldId}-error` : undefined
  const hintId = hint ? `${fieldId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...inputProps}
        className={`h-11 ${inputClass} ${error ? 'border-clay' : ''}`}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-clay">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs text-ink/55">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
