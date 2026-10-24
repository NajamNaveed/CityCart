const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Quick feedback on the phone; the server checks everything again.
export function validateLogin({ email = '', password = '' }) {
  const errors = {}
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Enter your password.'
  return errors
}

// The server's field messages are lower-case fragments ("invalid email format").
export function sentence(message) {
  const text = String(message || '').trim()
  if (!text) return ''
  const capped = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(capped) ? capped : `${capped}.`
}

export function sentenceAll(errors = {}) {
  return Object.fromEntries(Object.entries(errors).map(([field, message]) => [field, sentence(message)]))
}

// The customer's proof-of-delivery code: exactly six digits.
export const CODE_LENGTH = 6
export const isValidCode = (code) => new RegExp(`^[0-9]{${CODE_LENGTH}}$`).test(String(code || ''))
