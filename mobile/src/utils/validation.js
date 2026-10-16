// The same rules the server enforces (server/src/validators/auth.validator.js),
// checked on the phone first so mistakes are caught instantly. The server still
// checks everything again; this is only for quick feedback.
export const MIN_PASSWORD_LENGTH = 8

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLogin({ email = '', password = '' }) {
  const errors = {}
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}

export function validateRegister({ name = '', email = '', password = '' }) {
  const errors = {}
  if (!name.trim()) errors.name = 'Enter your name.'
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  return errors
}

// The server's field messages are lower-case fragments ("invalid email format").
// Turn them into a sentence for the screen.
export function sentence(message) {
  const text = String(message || '').trim()
  if (!text) return ''
  const capped = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(capped) ? capped : `${capped}.`
}

// { field: 'message' } -> { field: 'Message.' }
export function sentenceAll(errors = {}) {
  return Object.fromEntries(Object.entries(errors).map(([field, message]) => [field, sentence(message)]))
}
