/**
 * The saved-address rules, the same ones the server enforces: every address needs
 * a recipient, a phone number and a pin inside a delivery block.
 */
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }))

import api from '../src/services/api'
import { addressBody, createAddress, deleteAddress, fetchAddresses, makeDefaultAddress, updateAddress, validateAddress } from '../src/services/addresses'

const VALID = {
  label: 'Home',
  fullName: 'Sana Iqbal',
  phone: '+92 300 1234567',
  addressLine: 'House 41, Street 5',
  city: 'Faisalabad',
  postalCode: '38000',
  additionalInstructions: 'Blue gate',
  latitude: 31.41,
  longitude: 73.08,
}

beforeEach(() => jest.clearAllMocks())

describe('validateAddress', () => {
  it('accepts a complete address', () => {
    expect(validateAddress(VALID)).toEqual({})
  })

  it('claims every missing field, including the pin', () => {
    const errors = validateAddress({})
    expect(Object.keys(errors).sort()).toEqual(['addressLine', 'city', 'fullName', 'label', 'phone', 'pin'])
    expect(errors.pin).toBe('Choose the delivery spot on the map.')
  })

  it('rejects a phone number the server would refuse', () => {
    for (const phone of ['abc', '123', '+92 300 1234567 99999999', '']) expect(validateAddress({ ...VALID, phone })).toHaveProperty('phone')
    for (const phone of ['+92 300 1234567', '03001234567', '0300-1234567']) expect(validateAddress({ ...VALID, phone })).not.toHaveProperty('phone')
  })

  it('keeps names and text within the server limits', () => {
    expect(validateAddress({ ...VALID, label: 'x'.repeat(41) }).label).toContain('too long')
    expect(validateAddress({ ...VALID, fullName: 'x'.repeat(101) }).fullName).toContain('too long')
    expect(validateAddress({ ...VALID, addressLine: 'x'.repeat(301) }).addressLine).toContain('too long')
    expect(validateAddress({ ...VALID, city: 'x'.repeat(101) }).city).toContain('too long')
    expect(validateAddress({ ...VALID, postalCode: '1'.repeat(21) }).postalCode).toContain('too long')
    expect(validateAddress({ ...VALID, additionalInstructions: 'x'.repeat(2001) }).additionalInstructions).toContain('too long')
  })

  it('insists on a numeric pin', () => {
    expect(validateAddress({ ...VALID, latitude: '31.41' })).toHaveProperty('pin')
    expect(validateAddress({ ...VALID, longitude: NaN })).toHaveProperty('pin')
  })
})

describe('addressBody', () => {
  it('trims the text and leaves empty optional fields out', () => {
    expect(addressBody({ ...VALID, label: '  Home  ', postalCode: '  ', additionalInstructions: '   ' })).toEqual({
      label: 'Home',
      fullName: 'Sana Iqbal',
      phone: '+92 300 1234567',
      addressLine: 'House 41, Street 5',
      city: 'Faisalabad',
      latitude: 31.41,
      longitude: 73.08,
      isDefault: false,
    })
  })

  it('only asks to make the address default when the shopper ticked the box', () => {
    expect(addressBody({ ...VALID, isDefault: true }).isDefault).toBe(true)
    expect(addressBody({ ...VALID, isDefault: 'yes' }).isDefault).toBe(false)
  })
})

describe('address requests', () => {
  it('reads the list, and treats anything odd as no addresses', async () => {
    api.get.mockResolvedValue({ data: { addresses: [{ _id: 'a1' }] } })
    expect(await fetchAddresses()).toEqual([{ _id: 'a1' }])
    expect(api.get).toHaveBeenCalledWith('/addresses')
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchAddresses()).toEqual([])
  })

  it('creates, edits, defaults and deletes through the customer endpoints', async () => {
    api.post.mockResolvedValue({ data: { address: { _id: 'a1' } } })
    expect(await createAddress(addressBody(VALID))).toEqual({ _id: 'a1' })
    expect(api.post).toHaveBeenCalledWith('/addresses', expect.objectContaining({ label: 'Home' }))

    api.patch.mockResolvedValue({ data: { address: { _id: 'a1', label: 'Office' } } })
    expect((await updateAddress('a1', { ...addressBody(VALID), label: 'Office', isDefault: true })).label).toBe('Office')
    expect(api.patch).toHaveBeenCalledWith('/addresses/a1', expect.objectContaining({ label: 'Office' }))
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty('isDefault') // setting the default has its own endpoint

    await makeDefaultAddress('a1')
    expect(api.post).toHaveBeenLastCalledWith('/addresses/a1/default')

    api.delete.mockResolvedValue({ data: {} })
    await deleteAddress('a1')
    expect(api.delete).toHaveBeenCalledWith('/addresses/a1')
  })

  it('sends an optional field when the shopper cleared or changed it', async () => {
    api.patch.mockResolvedValue({ data: { address: {} } })
    await updateAddress('a1', { ...addressBody(VALID), postalCode: '', additionalInstructions: '' })
    expect(api.patch.mock.calls[0][1]).toMatchObject({ postalCode: '', additionalInstructions: '' })
  })
})
