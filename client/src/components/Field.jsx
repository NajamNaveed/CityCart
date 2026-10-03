import { inputClass } from '../ui'

// `error` (clay) wins over `hint` (any node, e.g. "Available").
export default function Field({ label, id, error, hint, ...inputProps }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </label>
      <input id={id} {...inputProps} className={`h-11 ${inputClass} ${error ? 'border-clay' : ''}`} />
      {error ? (
        <p className="mt-1.5 text-xs text-clay">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}