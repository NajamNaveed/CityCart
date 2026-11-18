import { useEffect, useState } from 'react'
import { getAssistantAvailable, subscribeAssistant } from '../components/ai/assistantBus'

/**
 * Whether the assistant drawer's /ai/ping probe succeeded. Pages use it to
 * hide assistant-only buttons when AI is off, matching the drawer itself.
 */
export function useAssistantAvailability() {
  const [available, setAvailable] = useState(getAssistantAvailable)
  useEffect(() => subscribeAssistant(setAvailable), [])
  return available
}
