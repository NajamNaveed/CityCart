// Controlled tab bar for filters and account sections. The panel below stays
// in the page; this only renders the accessible tab triggers.
export default function Tabs({ items, value, onChange, label = 'Sections', className = '' }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex flex-wrap items-center gap-1 border-b border-line-warm ${className}`.trim()}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`relative inline-flex items-center gap-1.5 px-3 pb-3 pt-1 text-[12px] font-medium transition ${
              active ? 'text-ink' : 'text-ink/50 hover:text-ink/80'
            }`}
          >
            {item.label}
            {item.count != null && <span className="text-[10.5px] text-muted">{item.count}</span>}
            <span
              aria-hidden="true"
              className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition ${active ? 'bg-clay' : 'bg-transparent'}`}
            />
          </button>
        )
      })}
    </div>
  )
}
