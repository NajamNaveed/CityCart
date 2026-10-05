// A rating shown as stars, filled in proportion to the value (4.3 fills 4 stars and a bit).
// Screen readers get the number instead of five separate star characters.
export default function Stars({ value = 0, className = '' }) {
  const percent = (Math.max(0, Math.min(5, value)) / 5) * 100
  return (
    <span
      role="img"
      aria-label={`${value} out of 5`}
      className={`relative inline-block whitespace-nowrap leading-none tracking-[0.1em] ${className}`}
    >
      <span aria-hidden="true" className="text-line">
        ★★★★★
      </span>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 overflow-hidden text-clay" style={{ width: `${percent}%` }}>
        ★★★★★
      </span>
    </span>
  )
}