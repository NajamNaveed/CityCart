import { PERMISSION_GROUPS, PRESETS } from '../../utils/permissions'

/**
 * Tick-box list of what a team member may do.
 * `canGrant(permission)` says whether the person editing may hand that permission out:
 * the server only lets a team member grant what they hold themselves (owners can grant anything).
 */
export default function PermissionPicker({ value, onChange, canGrant = () => true, disabled = false }) {
  const selected = new Set(value)

  function toggle(permission) {
    const next = new Set(selected)
    if (next.has(permission)) next.delete(permission)
    else next.add(permission)
    onChange([...next])
  }

  // A preset never adds something the editor is not allowed to grant.
  const applyPreset = (list) => onChange(list.filter((p) => canGrant(p) || selected.has(p)))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">Start from</span>
        {PRESETS.map(([label, list]) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => applyPreset(list)}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-pine hover:text-pine disabled:opacity-50"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className="rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition hover:text-danger"
        >
          Clear all
        </button>
      </div>

      <div className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {PERMISSION_GROUPS.map((group) => (
          <fieldset key={group.title} disabled={disabled}>
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{group.title}</legend>
            <div className="space-y-1.5">
              {group.items.map(([permission, label]) => {
                const locked = !canGrant(permission) && !selected.has(permission)
                return (
                  <label
                    key={permission}
                    className={`flex items-start gap-3 rounded-md px-2.5 py-1.5 text-sm transition ${
                      locked ? 'text-muted/60' : 'cursor-pointer text-ink hover:bg-paper'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(permission)}
                      disabled={locked || (!canGrant(permission) && selected.has(permission))}
                      onChange={() => toggle(permission)}
                      className="mt-0.5 size-4 accent-pine"
                    />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  )
}