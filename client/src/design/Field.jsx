import { useId } from 'react'
import { fieldClass, fieldError, fieldHint, fieldLabel } from './tokens'

// Labelled input, select or textarea with hint and error states. The error is
// wired with aria-describedby so screen readers announce it with the field.
export default function Field({
  label,
  hint,
  error,
  as = 'input',
  id,
  className = '',
  inputClassName = '',
  rows,
  children,
  ...props
}) {
  const autoId = useId()
  const fieldId = id || autoId
  const errorId = error ? `${fieldId}-error` : undefined
  const hintId = hint ? `${fieldId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  const shape = as === 'textarea' ? 'textarea' : as === 'select' ? 'select' : 'input'
  const Tag = shape === 'textarea' ? 'textarea' : shape === 'select' ? 'select' : 'input'
  const classes = fieldClass({ error: Boolean(error), shape, className: inputClassName })

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className={fieldLabel}>
          {label}
        </label>
      )}
      <Tag
        id={fieldId}
        rows={Tag === 'textarea' ? (rows ?? 4) : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={classes}
        {...props}
      >
        {children}
      </Tag>
      {error ? (
        <p id={errorId} className={fieldError}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={fieldHint}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}
