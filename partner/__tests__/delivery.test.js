import { addressLine, isClosed, isReturnOpen, locationMapUrl, reasonLabel, receiveDecisions, returnSummaryLine, returnUnits, telUrl } from '../src/utils/delivery'
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

describe('returned goods', () => {
  const ret = (over = {}) => ({
    status: 'IN_TRANSIT',
    lines: [{ quantity: 1 }, { quantity: 2 }],
    ...over,
  })

  it('counts the units coming back, and says whether they are still on the way', () => {
    expect(returnUnits(ret())).toBe(3)
    expect(returnUnits(null)).toBe(0)
    expect(returnSummaryLine(ret())).toBe('3 items coming back')
    expect(returnSummaryLine(ret({ status: 'RECEIVED', lines: [{ quantity: 1 }] }))).toBe('1 item back at the store')
    expect(isReturnOpen('IN_TRANSIT')).toBe(true)
    expect(isReturnOpen('RECEIVED')).toBe(false)
  })

  it('names every reason the rider can give', () => {
    expect(['DAMAGED', 'WRONG_ITEM', 'MISSING', 'NOT_WANTED'].map(reasonLabel)).toEqual(['Damaged', 'Wrong item', 'Missing', 'Not wanted'])
    expect(reasonLabel('SOMETHING_ELSE')).toBe('Other')
  })

  it('receives every line, restocking only the ticked ones (write off by default)', () => {
    expect(receiveDecisions([{}, {}])).toEqual([
      { index: 0, restock: false },
      { index: 1, restock: false },
    ])
    expect(receiveDecisions([{}, {}], { 1: true })).toEqual([
      { index: 0, restock: false },
      { index: 1, restock: true },
    ])
    expect(receiveDecisions(null)).toEqual([])
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
