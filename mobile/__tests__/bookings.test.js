jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))

import { bookingWhen, canCancel, eventDetail, eventLabel, priceOf, STATUS_NOTES } from '../src/services/bookings'

describe('priceOf', () => {
  it('uses the most final amount available', () => {
    expect(priceOf({ finalAmountPaisa: 450000, agreedPricePaisa: 400000 })).toBe(450000)
    expect(priceOf({ agreedPricePaisa: 400000, activeProposal: { pricePaisa: 350000 } })).toBe(400000)
    expect(priceOf({ activeProposal: { pricePaisa: 350000 }, customerOfferPaisa: 300000 })).toBe(350000)
  })

  it('falls back to the offer, then the guide price', () => {
    expect(priceOf({ customerOfferPaisa: 300000, offering: { startingAtPrice: 250000 } })).toBe(300000)
    expect(priceOf({ offering: { startingAtPrice: 250000 } })).toBe(250000)
    expect(priceOf({})).toBe(0)
  })

  it('keeps a zero amount instead of skipping it', () => {
    expect(priceOf({ finalAmountPaisa: 0, agreedPricePaisa: 400000 })).toBe(0)
  })
})

describe('booking state helpers', () => {
  it('reads the appointment from the booked slot, or the requested one', () => {
    expect(bookingWhen({ scheduledStart: 's', requestedStart: 'r' })).toBe('s')
    expect(bookingWhen({ requestedStart: 'r' })).toBe('r')
  })

  it('only offers cancelling while the booking is live', () => {
    expect(canCancel({ status: 'REQUESTED' })).toBe(true)
    expect(canCancel({ status: 'IN_PROGRESS' })).toBe(true)
    expect(canCancel({ status: 'COMPLETED' })).toBe(false)
    expect(canCancel({ status: 'CONFIRMED' })).toBe(false)
  })

  it('has a note for the two states that need the shopper to act', () => {
    expect(STATUS_NOTES.PROPOSED).toBe('Price ready')
    expect(STATUS_NOTES.COMPLETED).toBe('Confirm the job')
    expect(STATUS_NOTES.ACCEPTED).toBeUndefined()
  })
})

describe('timeline rows', () => {
  it('labels known events and falls back for unknown ones', () => {
    expect(eventLabel({ type: 'ACCEPTED' })).toBe('Booking accepted')
    expect(eventLabel({ type: 'PROPOSAL_ACCEPTED' })).toBe('Proposal accepted')
    expect(eventLabel({ type: 'SOMETHING_NEW' })).toBe('Booking updated')
  })

  it('shows the written note first', () => {
    expect(eventDetail({ type: 'ACCEPTED', note: 'See you at 9.' })).toBe('See you at 9.')
  })

  it('shows the price the event recorded', () => {
    expect(eventDetail({ type: 'PROPOSED', meta: { pricePaisa: 350000 } })).toBe('PKR 3500.00')
    expect(eventDetail({ type: 'COMPLETED', meta: { finalAmountPaisa: 450000 } })).toBe('Final PKR 4500.00')
  })

  it('credits CityCart for system events and stays quiet otherwise', () => {
    expect(eventDetail({ type: 'AUTO_CONFIRMED', byRole: 'SYSTEM' })).toBe('By CityCart')
    expect(eventDetail({ type: 'ACCEPTED', byRole: 'PROVIDER' })).toBe('')
  })
})
