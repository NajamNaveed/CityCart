import { ChevronDown, MapPin } from 'lucide-react'
import { useCity } from '../../hooks/useCity'
import { useNearby } from '../../hooks/useNearby'

// "Where am I shopping?" — opens the location picker. Shows the block when
// there is one, otherwise the city, otherwise an invitation to set it.
export default function LocationChip({ className = '' }) {
  const { city } = useCity()
  const { block, blocksReady, openPicker } = useNearby()

  // One control for city AND area: the area when there is one, otherwise the city, otherwise an invitation.
  const label = block ? block.name : city ? city.name : 'Set location'
  const title = block && city ? `${block.name}, ${city.name}` : label

  return (
    <button
      type="button"
      onClick={openPicker}
      title={title}
      aria-label={`Location: ${title}. Change`}
      className={`flex h-9 max-w-44 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[13px] font-medium text-ink transition hover:border-ink ${className}`}
    >
      <MapPin className="h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
      <span className={`truncate ${blocksReady ? '' : 'opacity-60'}`}>{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
    </button>
  )
}
