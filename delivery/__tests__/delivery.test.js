jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))

import {
  acceptanceFrom,
  acceptanceReady,
  acceptanceSummary,
  addressLine,
  canComplete,
  cashSummary,
  codeErrorMessage,
  collectionPayload,
  collectionReady,
  isClosed,
  linesPayload,
  mapsUrl,
  nextMoves,
  paymentMethodsFor,
  proofErrorMessage,
  returnErrorMessage,
  setAcceptedQty,
  telUrl,
} from '../src/utils/delivery'
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
  it('collect, collected, a non-cash payment, or prepaid', () => {
    expect(cashSummary({ amountToCollect: 2450, cashCollected: false })).toEqual({ kind: 'collect', amount: 2450 })
    expect(cashSummary({ amountToCollect: 0, cashCollected: true })).toEqual({ kind: 'collected' })
    expect(cashSummary({ amountToCollect: 0, cashCollected: false, proofStatus: 'SUBMITTED' })).toEqual({
      kind: 'proof',
      status: 'SUBMITTED',
    })
    expect(cashSummary({ amountToCollect: 0, cashCollected: false })).toEqual({ kind: 'prepaid' })
    expect(cashSummary(null)).toEqual({ kind: 'none' })
    // Everything came back: there is nothing to collect and nothing owed.
    expect(cashSummary({ amountToCollect: 2450, fulfilment: 'NONE' })).toEqual({ kind: 'none' })
  })
})

describe('a payment taken at the door (docs/21 §I)', () => {
  it('offers only what the server allows: cash alone when a photo cannot be stored', () => {
    expect(paymentMethodsFor({ paymentOptions: ['CASH'] }).map((m) => m.method)).toEqual(['CASH'])
    expect(paymentMethodsFor({ paymentOptions: ['CASH', 'BANK_TRANSFER', 'WALLET', 'CARD_MACHINE'] }).map((m) => m.label)).toEqual([
      'Cash',
      'Bank transfer',
      'Wallet',
      'Card machine',
    ])
    expect(paymentMethodsFor({})).toEqual([])
  })

  it('cash is ready at once; anything else needs a reference, a photo, and a wallet for a wallet payment', () => {
    expect(collectionReady({ method: 'CASH' })).toBe(true)
    expect(collectionReady({ method: 'BANK_TRANSFER', reference: 'FT-1' })).toBe(false) // no photo
    expect(collectionReady({ method: 'BANK_TRANSFER', reference: 'FT-1', proof: { publicId: 'p' } })).toBe(true)
    expect(collectionReady({ method: 'WALLET', reference: 'JC-1', proof: { publicId: 'p' } })).toBe(false) // no wallet
    expect(collectionReady({ method: 'WALLET', wallet: 'JAZZCASH', reference: 'JC-1', proof: { publicId: 'p' } })).toBe(true)
    expect(collectionReady({ method: 'CARD_MACHINE', reference: '  ', proof: { publicId: 'p' } })).toBe(false)
    expect(collectionReady(null)).toBe(false)
  })

  it('sends exactly what the server accepts, and no card number', () => {
    expect(collectionPayload({ method: 'CASH', reference: 'ignored', proof: { publicId: 'p' } })).toEqual({ method: 'CASH' })
    expect(
      collectionPayload({
        method: 'WALLET',
        wallet: 'JAZZCASH',
        reference: ' JC-778812 ',
        proof: { publicId: 'p', fingerprint: 'e' },
      }),
    ).toEqual({
      method: 'WALLET',
      wallet: 'JAZZCASH',
      reference: 'JC-778812',
      proof: { publicId: 'p', fingerprint: 'e' },
    })
    expect(collectionPayload({ method: 'BANK_TRANSFER', wallet: 'JAZZCASH', reference: 'FT-1', proof: { publicId: 'p' } })).toEqual({
      method: 'BANK_TRANSFER',
      reference: 'FT-1',
      proof: { publicId: 'p' },
    })
  })

  it('explains a refused photo in the rider’s terms', () => {
    const fail = (data, status = 422) => ({ response: { status, data } })
    expect(proofErrorMessage(fail({ code: 'PROOF_NOT_YOURS' }))).toMatch(/does not belong to this delivery/)
    expect(proofErrorMessage(fail({ code: 'PROOF_NOT_CONFIGURED' }, 503))).toMatch(/take cash only/i)
    expect(proofErrorMessage(fail({ code: 'PAYMENT_PREPAID' }, 409))).toMatch(/already paid/i)
    expect(proofErrorMessage({ codeMessage: 'The photo could not be uploaded.' })).toBe('The photo could not be uploaded.')
  })
})

describe('counting what came back at the door (docs/22 §F)', () => {
  const lines = () => acceptanceFrom({ items: [{ itemId: 'i1', productName: 'Suit', quantity: 2, lineTotal: 2200 }] })
  const order = { deliveryFee: 250 }

  it('every line starts fully accepted', () => {
    expect(acceptanceFrom(null)).toEqual([])
    expect(lines()).toEqual([
      {
        itemId: 'i1',
        productName: 'Suit',
        quantity: 2,
        lineTotal: 2200,
        acceptedQty: 2,
        rejectedQty: 0,
        reason: null,
        photo: null,
        photoUri: null,
        asset: null,
      },
    ])
  })

  it('counts refused units, never outside what was ordered', () => {
    const line = lines()[0]
    expect(setAcceptedQty(line, 1)).toMatchObject({ acceptedQty: 1, rejectedQty: 1 })
    expect(setAcceptedQty(line, -4)).toMatchObject({ acceptedQty: 0, rejectedQty: 2 })
    expect(setAcceptedQty(line, 9)).toMatchObject({ acceptedQty: 2, rejectedQty: 0 })
    // A line kept in full carries no reason, even if one was picked earlier.
    expect(setAcceptedQty({ ...line, acceptedQty: 0, rejectedQty: 2, reason: 'DAMAGED' }, 2).reason).toBeNull()
  })

  it('prices the kept units and adds the fee, refunding it only for a full store-fault return', () => {
    const half = [{ ...lines()[0], acceptedQty: 1, rejectedQty: 1, reason: 'DAMAGED' }]
    expect(acceptanceSummary(half, order)).toMatchObject({ acceptedTotal: 1100, returnedTotal: 1100, netTotal: 1350, refundTotal: 1100, feeRefunded: false })

    const storeFault = [{ ...lines()[0], acceptedQty: 0, rejectedQty: 2, reason: 'WRONG_ITEM' }]
    expect(acceptanceSummary(storeFault, order)).toMatchObject({ netTotal: 0, refundTotal: 2450, feeRefunded: true, everythingRejected: true })

    // The customer changed their mind: the fee is still earned.
    const notWanted = [{ ...lines()[0], acceptedQty: 0, rejectedQty: 2, reason: 'NOT_WANTED' }]
    expect(acceptanceSummary(notWanted, order)).toMatchObject({ netTotal: 250, refundTotal: 2200, feeRefunded: false })

    const all = lines()
    expect(acceptanceSummary(all, order)).toMatchObject({ acceptedTotal: 2200, returnedTotal: 0, netTotal: 2450, refundTotal: 0 })
  })

  it('sends one line per item, with reasons and photos only for what came back', () => {
    const line = { ...lines()[0], acceptedQty: 1, rejectedQty: 1, reason: 'DAMAGED', photo: { publicId: 'p' } }
    expect(linesPayload([line])).toEqual([
      { itemId: 'i1', acceptedQty: 1, rejectedQty: 1, reason: 'DAMAGED', photo: { publicId: 'p' } },
    ])
    expect(linesPayload(lines())).toEqual([{ itemId: 'i1', acceptedQty: 2, rejectedQty: 0 }])
    expect(linesPayload(null)).toEqual([])
  })

  it('is ready only when every refusal has a reason', () => {
    expect(acceptanceReady([])).toBe(true)
    expect(acceptanceReady(lines())).toBe(true)
    expect(acceptanceReady([{ rejectedQty: 1, reason: null }])).toBe(false)
    expect(acceptanceReady([{ rejectedQty: 1, reason: 'MISSING' }])).toBe(true)
  })

  it('explains a refused return in the rider’s terms', () => {
    const fail = (data, status = 422) => ({ response: { status, data } })
    expect(returnErrorMessage(fail({ code: 'INVALID_RETURN_QUANTITY' }))).toMatch(/More units were refused/)
    expect(returnErrorMessage(fail({ code: 'INVALID_RETURN_REASON' }))).toMatch(/Choose why each refused item/)
    expect(returnErrorMessage(fail({ code: 'RETURN_PHOTO_NOT_CONFIGURED' }, 503))).toMatch(/Complete without a photo/)
    expect(returnErrorMessage(fail({ code: 'RETURN_PHOTO_NOT_YOURS' }))).toMatch(/does not belong to this delivery/)
    expect(returnErrorMessage({ codeMessage: 'No connection.' })).toBe('No connection.')
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
