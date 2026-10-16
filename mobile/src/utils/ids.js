// A MongoDB id is 24 hex characters. Checking before asking the server saves a
// round trip and keeps junk out of the request.
export const isObjectId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
