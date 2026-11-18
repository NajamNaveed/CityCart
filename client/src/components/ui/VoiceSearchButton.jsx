import { useEffect } from 'react'
import { Mic } from 'lucide-react'

import { useVoiceInput } from '../../hooks/useVoiceInput'

/**
 * Speech-to-text mic for a search box. The recognised words go into the field
 * and nothing is submitted; the customer still presses Search or Send.
 * Browsers without the Web Speech API render nothing at all.
 */
export default function VoiceSearchButton({ onResult, label = 'Search by voice', className = '' }) {
  const { supported, listening, error, start, stop, clearError } = useVoiceInput(onResult)

  useEffect(() => {
    if (!error) return undefined
    const timer = setTimeout(clearError, 8000)
    return () => clearTimeout(timer)
  }, [error, clearError])

  if (!supported) return null

  return (
    <span className={`inline-flex ${className}`}>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? `${label} — listening, tap to stop` : label}
        aria-pressed={listening}
        title={listening ? 'Listening… tap to stop' : label}
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
          listening ? 'bg-clay/10 text-clay' : 'text-ink/40 hover:bg-ink/5 hover:text-ink'
        }`}
      >
        <Mic className={`h-4 w-4 ${listening ? 'animate-pulse' : ''}`} aria-hidden="true" />
        {listening && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
        )}
      </button>
      {error && (
        <span
          role="status"
          className="absolute bottom-full right-0 z-50 mb-1.5 w-56 rounded-tile border border-clay/25 bg-paper px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-clay shadow-lg"
        >
          {error}
        </span>
      )}
    </span>
  )
}
