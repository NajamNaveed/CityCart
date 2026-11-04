/**
 * The customer's change-proposal card: who suggested the change, and that a
 * brand-side proposal carries no picker label.
 */
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
}))

import OrderChangeCard from '../src/components/OrderChangeCard'
import { screenText } from './helpers/screens'

const ORDER = { _id: 'o1', paymentMethod: 'COD', paymentStatus: 'PENDING' }

const ADJUSTMENT = (over = {}) => ({
  _id: 'a1',
  status: 'PROPOSED',
  note: 'We are short on the blue scarf.',
  expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  totalsBefore: { total: 3000 },
  totalsAfter: { total: 2500 },
  totalsAfterRemoval: { total: 2000 },
  lines: [
    {
      orderItemId: 'i1',
      productName: 'Blue scarf',
      orderedQuantity: 2,
      supplyQuantity: 1,
      substitute: { productName: 'Grey scarf', quantity: 1 },
    },
  ],
  ...over,
})

const show = async (adjustment) => {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(<OrderChangeCard order={ORDER} adjustment={adjustment} onDone={jest.fn()} />)
  })
  return renderer
}

describe('change proposal card', () => {
  it('says the change came from the store\u2019s picker when it did', async () => {
    const screen = await show(ADJUSTMENT({ proposedByRole: 'PICKER' }))
    const text = screenText(screen)
    expect(text).toContain('Suggested by the store\u2019s picker.')
    expect(text).toContain('We are short on the blue scarf.')
  })

  it('carries no picker label for a proposal made by the brand team', async () => {
    const screen = await show(ADJUSTMENT({ proposedByRole: 'BRAND_ADMIN' }))
    expect(screenText(screen)).not.toContain('Suggested by the store\u2019s picker.')
  })
})
