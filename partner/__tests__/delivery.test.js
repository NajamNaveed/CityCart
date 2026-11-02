import { addressLine, isClosed, locationMapUrl, telUrl } from '../src/utils/delivery'
import { sentence, validateLogin } from '../src/utils/validation'

describe('delivery status and links', () => {
  it('knows which deliveries are closed', () => {
    ;['DELIVERED', 'CANCELLED', 'RETURNED'].forEach((s) => expect(isClosed(s)).toBe(true))
    ;['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'FAILED'].forEach((s) => expect(isClosed(s)).toBe(false))
  })

  it('builds a dialler link from any phone format', () => {
    expect(telUrl('+92 300 1112223')).toBe('tel:+923001112223')
    expect(telUrl('0300-1112223')).toBe('tel:03001112223')
  })

  it('builds a map link for a position a rider shared', () => {
    expect(locationMapUrl({ latitude: 31.4181, longitude: 73.0776 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=31.4181,73.0776',
    )
  })

  it('shows a one-line address', () => {
    expect(addressLine({ address: 'House 5, Street 2', city: 'Faisalabad' })).toBe('House 5, Street 2, Faisalabad')
    expect(addressLine(null)).toBe('')
  })
})

describe('validation', () => {
  it('sign-in needs an email and a password', () => {
    expect(validateLogin({ email: 'hira@example.com', password: 'x' })).toEqual({})
    expect(validateLogin({ email: 'nope', password: '' })).toEqual({ email: 'Enter a valid email address.', password: 'Enter your password.' })
  })

  it('turns server field fragments into sentences', () => {
    expect(sentence('invalid email format')).toBe('Invalid email format.')
  })
})
