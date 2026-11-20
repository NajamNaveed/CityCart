/**
 * A tiny bridge between a page and the mounted Ask CityCart drawer (docs/29
 * Phase 2e). Pages can open the assistant with a prefilled question; the
 * customer still presses send, so nothing is ever sent for them.
 */
const OPEN_EVENT = 'citycart:assistant-open'

let available = false
const listeners = new Set()

/** The drawer owns the /ai/ping probe and shares its answer here. */
export function setAssistantAvailable(value) {
  if (available === value) return
  available = value
  for (const listener of listeners) listener(value)
}

export function getAssistantAvailable() {
  return available
}

export function subscribeAssistant(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openAssistant({ message } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { message } }))
}

export const ASSISTANT_OPEN_EVENT = OPEN_EVENT
