/** "Also sold by": the same catalogue product at other stores in the shopper's area. */
import React from 'react'
import { act } from 'react-test-renderer'

const mockRouter = { push: jest.fn(), navigate: jest.fn() }

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
}))

import api from '../src/services/api'
import { NearbyContext } from '../src/context/contexts'
import AlsoSoldBy from '../src/components/AlsoSoldBy'
import { nearbyValue, press, pressByLabel, screenText, show, tick } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BLOCK = { _id: ID(9), name: 'Gulberg' }
const POSITION = { lat: 31.4, lng: 73.1 }
const area = () => nearbyValue({ blockIds: [BLOCK._id], selectedBlocks: [BLOCK], areaName: BLOCK.name, coords: POSITION, origin: POSITION })
const noArea = () => nearbyValue()

const OFFER = (productId, brandName, price) => ({ productId, brandName, price, nearestKm: 1.2, branchCount: 1, availability: 'IN_STOCK' })
const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } })

async function open(element, nearby = area()) {
  return show(<NearbyContext.Provider value={nearby}>{element}</NearbyContext.Provider>)
}

beforeEach(() => jest.clearAllMocks())

describe('AlsoSoldBy', () => {
  it('stays away when the product does not belong to the shared catalogue', async () => {
    const renderer = await open(<AlsoSoldBy currentProductId={ID(2)} />)
    expect(screenText(renderer)).toBe('')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('asks for an area first, because offers are area-only', async () => {
    const nearby = noArea()
    const renderer = await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />, nearby)
    expect(screenText(renderer)).toContain('Choose your area to see the other stores that sell this product.')
    expect(api.get).not.toHaveBeenCalled()

    await press(renderer, 'Choose area')
    expect(mockRouter.navigate).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/nearby', params: expect.objectContaining({ view: 'map' }) }))
  })

  it('lists the other stores, with distances and prices, and opens one', async () => {
    api.get.mockResolvedValue({
      data: {
        item: {
          catalogProductId: ID(3),
          offers: [OFFER(ID(2), 'Loom & Co.', 3200), { ...OFFER(ID(8), 'Mehr Textiles', 3400), nearestKm: 2.1, branchCount: 2 }, { ...OFFER(ID(6), 'Fabric House', 999), availability: 'OUT_OF_STOCK' }],
        },
      },
    })
    const renderer = await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />)
    // The current product is never offered as an alternative to itself.
    const text = screenText(renderer)
    expect(text).toContain('Also sold by')
    expect(text).toContain('Mehr Textiles')
    expect(text).toContain('Rs 3,400')
    expect(text).toContain('2.1 km away · 2 shops')
    expect(text).toContain('Fabric House')
    expect(text).toContain('Sold out')
    expect(text).not.toContain('Loom & Co.')

    expect(api.get).toHaveBeenCalledWith(`/catalog/browse/${ID(3)}`, { params: { blockIds: BLOCK._id, lat: POSITION.lat, lng: POSITION.lng } })
  })

  it('opens the chosen offer\'s product page', async () => {
    api.get.mockResolvedValue({ data: { item: { offers: [OFFER(ID(2), 'Loom & Co.', 3200), OFFER(ID(8), 'Mehr Textiles', 3400)] } } })
    const renderer = await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />)
    await pressByLabel(renderer, 'Mehr Textiles, Rs 3,400')
    expect(mockRouter.push).toHaveBeenCalledWith(`/product/${ID(8)}`)
  })

  it('says when only this store sells it in the area', async () => {
    api.get.mockResolvedValue({ data: { item: { offers: [OFFER(ID(2), 'Loom & Co.', 3200)] } } })
    expect(screenText(await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />))).toContain('Only sold at this store in your area.')
  })

  it('says plainly when nobody in the area sells the product any more', async () => {
    api.get.mockRejectedValue(httpError(404, 'This product is not sold in your area.'))
    const text = screenText(await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />))
    expect(text).toContain('This product isn’t sold by any store in your area.')
    expect(text).not.toContain('Try again')
  })

  it('offers to try again after a real error', async () => {
    api.get.mockRejectedValueOnce(new Error('Cannot reach the server.'))
    const renderer = await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />)
    expect(screenText(renderer)).toContain('Cannot reach the server.')

    api.get.mockResolvedValue({ data: { item: { offers: [OFFER(ID(2), 'Loom & Co.', 3200), OFFER(ID(8), 'Mehr Textiles', 3400)] } } })
    await press(renderer, 'Try again')
    expect(screenText(renderer)).toContain('Mehr Textiles')
  })

  it('shows a spinner while the stores are being looked up', async () => {
    let finish
    api.get.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const renderer = await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />)
    expect(screenText(renderer)).toContain('Looking for other stores…')
    await act(async () => finish({ data: { item: { offers: [OFFER(ID(8), 'Mehr Textiles', 3400)] } } }))
    await tick()
    expect(screenText(renderer)).toContain('Mehr Textiles')
  })

  it('lets the shopper change the area from the title', async () => {
    api.get.mockResolvedValue({ data: { item: { offers: [] } } })
    const renderer = await open(<AlsoSoldBy catalogProductId={ID(3)} currentProductId={ID(2)} />)
    await press(renderer, 'Change area')
    expect(mockRouter.navigate).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/nearby', params: expect.objectContaining({ view: 'map' }) }))
  })
})
