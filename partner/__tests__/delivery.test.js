jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))

import { addressLine, canComplete, cashSummary, codeErrorMessage, isClosed, mapsUrl, nextMoves, telUrl } from '../src/utils/delivery'
import { CODE_LENGTH, isValidCode, sentence, validateLogin } from '../src/utils/validation'

describe('what a rider can do, by delivery status (mirrors the server lifecycle)', () => {
  it('moves forward one step at a time', () => {
    expect(nextMoves('READY_FOR_PICKUP').map((m) => m.status)).toEqual(['PICKED_UP'])
    // one step after picked up: a rider's trip from the brand to the customer is one journey
    expect(nextMoves('PICKED_UP').map((m) => m.label)).toEqual(['Out for delivery'])
    expect(nextMoves('PICKED_UP').map((m) => m.status)).toEqual(['OUT_FOR_DELIVERY'])
    // a delivery the brand already set to in transit still moves on the same way
    expect(nextMoves('IN_TRANSIT').map((m) => m.status)).toEqual(['OUT_FOR_DELIVERY'])
    expect(nextMoves('FAILED').map((m) => m.status)).toEqual(['OUT_FOR_DELIVERY']) // try again
  })

  it('never offers DELIVERED as a button: that needs the customer\'s code', () => {
    ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED', 'DELIVERED'].forEach((status) => {
      expect(nextMoves(status).map((m) => m.status)).not.toContain('DELIVERED')
    })
  })

  it('offers nothing for a delivery out for delivery or already closed (except the code / failed flow)', () => {
    expect(nextMoves('OUT_FOR_DELIVERY')).toEqual([])
    expect(nextMoves('DELIVERED')).toEqual([])
    expect(nextMoves('RETURNED')).toEqual([])
  })

  it('completing with the code, or recording a failure, happens only at the door', () => {
    expect(canComplete('OUT_FOR_DELIVERY')).toBe(true)
    ;['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'FAILED', 'DELIVERED'].forEach((s) => expect(canComplete(s)).toBe(false))
  })

  it('knows which deliveries are closed', () => {
    ;['DELIVERED', 'CANCELLED', 'RETURNED'].forEach((s) => expect(isClosed(s)).toBe(true))
    ;['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'FAILED'].forEach((s) => expect(isClosed(s)).toBe(false))
  })
})

describe('links and addresses', () => {
  it('builds a dialler link from any phone format', () => {
    expect(telUrl('+92 300 1112223')).toBe('tel:+923001112223')
    expect(telUrl('0300-1112223')).toBe('tel:03001112223')
  })

  it('builds a maps search link, and none without an address', () => {
    const url = mapsUrl({ address: 'House 5, Street 2', city: 'Faisalabad', postalCode: '38000' })
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=House%205%2C%20Street%202%2C%20Faisalabad%2C%2038000')
    expect(mapsUrl(null)).toBeNull()
    expect(mapsUrl({})).toBeNull()
  })

  it('shows a one-line address', () => {
    expect(addressLine({ address: 'House 5, Street 2', city: 'Faisalabad' })).toBe('House 5, Street 2, Faisalabad')
    expect(addressLine(null)).toBe('')
  })
})

describe('the delivery code messages', () => {
  const failure = (data, status = 422) => ({ response: { status, data } })

  it('says how many tries are left', () => {
    expect(codeErrorMessage(failure({ code: 'INVALID_CODE', attemptsRemaining: 3 }))).toBe('That code is not correct. 3 tries left.')
    expect(codeErrorMessage(failure({ code: 'INVALID_CODE', attemptsRemaining: 1 }))).toBe('That code is not correct. 1 try left.')
  })

  it('tells the rider to ask the brand when the code is used up or locked', () => {
    expect(codeErrorMessage(failure({ code: 'INVALID_CODE', attemptsRemaining: 0 }))).toMatch(/ask the brand/i)
    expect(codeErrorMessage(failure({ code: 'CODE_LOCKED' }, 429))).toMatch(/Ask the brand/)
    expect(codeErrorMessage(failure({ code: 'NO_DELIVERY_CODE' }, 409))).toMatch(/Ask the brand/)
  })

  it('falls back to the normal error message', () => {
    expect(codeErrorMessage(failure({ message: 'Delivery not found.' }, 404))).toBe('Delivery not found.')
    expect(codeErrorMessage(new Error('Network Error'))).toMatch(/Cannot reach the server/)
  })
})

describe('the cash line', () => {
  it('collect, collected or prepaid', () => {
    expect(cashSummary({ amountToCollect: 2450, cashCollected: false })).toEqual({ kind: 'collect', amount: 2450 })
    expect(cashSummary({ amountToCollect: 0, cashCollected: true })).toEqual({ kind: 'collected' })
    expect(cashSummary({ amountToCollect: 0, cashCollected: false })).toEqual({ kind: 'prepaid' })
    expect(cashSummary(null)).toEqual({ kind: 'none' })
  })
})

describe('validation', () => {
  it('the code is exactly six digits', () => {
    expect(CODE_LENGTH).toBe(6)
    expect(isValidCode('482913')).toBe(true)
    ;['48291', '4829133', 'abcdef', '48 913', '', undefined].forEach((c) => expect(isValidCode(c)).toBe(false))
  })

  it('sign-in needs an email and a password', () => {
    expect(validateLogin({ email: 'bilal@example.com', password: 'x' })).toEqual({})
    expect(validateLogin({ email: 'nope', password: '' })).toEqual({ email: 'Enter a valid email address.', password: 'Enter your password.' })
  })

  it('turns server field fragments into sentences', () => {
    expect(sentence('invalid email format')).toBe('Invalid email format.')
  })
})
