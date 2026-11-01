jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }))

import api from '../src/services/api'
import { checkCartArea, deleteAddress, fetchAddresses, formFromAddress, setDefaultAddress } from '../src/services/addresses'
import { deliveryProblem, orderBody, validateCheckout } from '../src/services/orders'

beforeEach(() => jest.clearAllMocks())

const address = {
  _id: 'a1',
  label: 'Home',
  fullName: 'Mahnoor Iqbal',
  phone: '+923001234567',
  addressLine: 'House 4, Street 2',
  city: 'Faisalabad',
  postalCode: '38000',
  additionalInstructions: 'Blue gate. Ring twice.',
  latitude: 31.4045,
  longitude: 73.095,
  isDefault: true,
  blocks: [{ _id: 'b1', name: 'D Ground' }],
}

describe('saved addresses', () => {
  it('fetchAddresses returns the list and copes with odd answers', async () => {
    api.get.mockResolvedValue({ data: { addresses: [address] } })
    expect(await fetchAddresses()).toEqual([address])
    expect(api.get).toHaveBeenCalledWith('/addresses')
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchAddresses()).toEqual([])
  })

  it('makes an address the default, and deletes one', async () => {
    api.post.mockResolvedValue({ data: { address } })
    expect(await setDefaultAddress('a1')).toEqual(address)
    expect(api.post).toHaveBeenCalledWith('/addresses/a1/default')
    api.delete.mockResolvedValue({ data: {} })
    await deleteAddress('a1')
    expect(api.delete).toHaveBeenCalledWith('/addresses/a1')
  })

  it('turns a saved address into the checkout form, keeping notes the shopper already wrote', () => {
    expect(formFromAddress(address, { fullName: 'x', additionalInstructions: '' })).toEqual({
      fullName: 'Mahnoor Iqbal',
      phone: '+923001234567',
      addressLine: 'House 4, Street 2',
      city: 'Faisalabad',
      postalCode: '38000',
      additionalInstructions: 'Blue gate. Ring twice.',
    })
    expect(formFromAddress(address, { additionalInstructions: 'Call me first' }).additionalInstructions).toBe('Call me first')
    expect(formFromAddress({ ...address, postalCode: undefined, additionalInstructions: undefined }, {})).toMatchObject({ postalCode: '', additionalInstructions: '' })
  })
})

describe('checkCartArea', () => {
  it('asks which cart items can still be delivered in the chosen blocks', async () => {
    api.post.mockResolvedValue({ data: { deliverable: ['p1'], undeliverable: [{ productId: 'p2', name: 'Silk', brandName: 'Far Boutique' }] } })
    expect(await checkCartArea(['b1', 'b2'])).toEqual({ deliverable: ['p1'], undeliverable: [{ productId: 'p2', name: 'Silk', brandName: 'Far Boutique' }] })
    expect(api.post).toHaveBeenCalledWith('/cart/area-check', { blockIds: ['b1', 'b2'] })
    api.post.mockResolvedValue({ data: {} })
    expect(await checkCartArea(['b1'])).toEqual({ deliverable: [], undeliverable: [] })
  })
})

describe('checkout with a delivery pin', () => {
  const form = { fullName: ' Mahnoor ', phone: '+923001234567', addressLine: 'House 4', city: 'Faisalabad', postalCode: '', additionalInstructions: ' Blue gate ' }
  const pin = { lat: 31.4045, lng: 73.095 }

  it('sends the pin as latitude/longitude, and nothing about saving by default', () => {
    const body = orderBody(form, 'COD', { pin })
    expect(body.deliveryLocation).toEqual({ latitude: 31.4045, longitude: 73.095 })
    expect(body.shippingAddress.fullName).toBe('Mahnoor')
    expect(body).not.toHaveProperty('saveAddress')
    expect(body).not.toHaveProperty('addressId')
  })

  it('links a saved address, or asks to save a new one under a name', () => {
    expect(orderBody(form, 'COD', { pin, addressId: 'a1' })).toMatchObject({ addressId: 'a1' })
    expect(orderBody(form, 'COD', { pin, addressId: 'a1' })).not.toHaveProperty('saveAddress')
    expect(orderBody(form, 'COD', { pin, saveAs: ' Work ' }).saveAddress).toEqual({ label: 'Work' })
    expect(orderBody(form, 'COD', { pin, saveAs: '  ' })).not.toHaveProperty('saveAddress')
  })

  it('only checks the delivery notes when a saved address is used', () => {
    expect(validateCheckout({ additionalInstructions: 'Call me' }, { savedAddress: true })).toEqual({})
    expect(Object.keys(validateCheckout({ additionalInstructions: '' }, { savedAddress: true }))).toEqual(['additionalInstructions'])
    expect(Object.keys(validateCheckout({ additionalInstructions: 'Call me' }))).toEqual(expect.arrayContaining(['fullName', 'phone', 'addressLine', 'city']))
  })

  it('explains a refusal because of where the order should go', () => {
    const refused = (data) => ({ response: { data } })
    const text = deliveryProblem(refused({ code: 'CHECKOUT_ISSUES', issues: [{ code: 'NOT_DELIVERABLE', brandName: 'Far Boutique' }, { code: 'NOT_DELIVERABLE', brandName: 'Far Boutique' }, { code: 'NOT_DELIVERABLE', brandName: 'Silk Road' }] }))
    expect(text).toMatch(/Far Boutique and Silk Road cannot deliver to this spot/)
    expect(deliveryProblem(refused({ code: 'CHECKOUT_ISSUES', issues: [{ code: 'NOT_DELIVERABLE' }] }))).toMatch(/Some stores cannot deliver/)
    expect(deliveryProblem(refused({ code: 'OUTSIDE_DELIVERY_ZONE' }))).toMatch(/do not deliver to that spot/)
    expect(deliveryProblem(refused({ code: 'CHECKOUT_ISSUES', issues: [{ code: 'OUT_OF_STOCK' }] }))).toBe('')
    expect(deliveryProblem(new Error('Network Error'))).toBe('')
  })
})
