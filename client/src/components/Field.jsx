export default function Field({ label, id, error, ...inputProps }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className={`h-11 w-full rounded-sm border bg-paper px-3.5 text-sm text-ink placeholder-muted/60 outline-none transition focus:border-ink ${
          error ? 'border-clay' : 'border-line'
        }`}
      />
      {error && <p className="mt-1.5 text-xs text-clay">{error}</p>}
    </div>
  )
}