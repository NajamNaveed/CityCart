import { MIN_PASSWORD_LENGTH, sentence, sentenceAll, validateLogin, validateRegister } from '../src/utils/validation'

describe('validateLogin', () => {
  it('accepts a normal email and any non-empty password', () => {
    expect(validateLogin({ email: 'sana@example.com', password: 'x' })).toEqual({})
    expect(validateLogin({ email: '  sana@example.com  ', password: 'secret' })).toEqual({})
  })

  it('flags a bad email and a missing password', () => {
    expect(validateLogin({ email: 'sana@', password: '' })).toEqual({
      email: 'Enter a valid email address.',
      password: 'Enter your password.',
    })
    expect(validateLogin({})).toHaveProperty('email')
    expect(validateLogin({ email: 'a b@c.com', password: 'x' })).toHaveProperty('email')
  })
})

describe('validateRegister', () => {
  const good = { name: 'Sana Iqbal', email: 'sana@example.com', password: 'longenough' }

  it('accepts valid details', () => {
    expect(validateRegister(good)).toEqual({})
  })

  it('requires a name, so a blank or whitespace-only one is refused', () => {
    expect(validateRegister({ ...good, name: '' })).toHaveProperty('name')
    expect(validateRegister({ ...good, name: '   ' })).toHaveProperty('name')
  })

  it('enforces the same 8-character password minimum as the server', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(validateRegister({ ...good, password: '1234567' }).password).toBe('Use at least 8 characters.')
    expect(validateRegister({ ...good, password: '12345678' })).toEqual({})
    // spaces count as characters and are never trimmed away
    expect(validateRegister({ ...good, password: '        ' })).toEqual({})
  })

  it('reports every problem at once', () => {
    expect(Object.keys(validateRegister({ name: '', email: 'nope', password: 'x' })).sort()).toEqual(['email', 'name', 'password'])
  })
})

describe('sentence / sentenceAll (server messages on screen)', () => {
  it('capitalises and ends with a full stop', () => {
    expect(sentence('invalid email format')).toBe('Invalid email format.')
    expect(sentence('Password too short!')).toBe('Password too short!')
    expect(sentence('')).toBe('')
    expect(sentence(undefined)).toBe('')
  })

  it('converts a whole error object', () => {
    expect(sentenceAll({ email: 'invalid email format', name: 'name is required' })).toEqual({
      email: 'Invalid email format.',
      name: 'Name is required.',
    })
    expect(sentenceAll()).toEqual({})
  })
})
