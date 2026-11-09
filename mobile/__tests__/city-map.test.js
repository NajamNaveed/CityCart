/**
 * The two map helpers: the city-wide directory (the "All" layer) and focus
 * (framing a chosen city before its results arrive).
 */
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { CityContext } from '../src/context/contexts'

jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))
jest.mock('../src/services/nearby', () => ({ fetchBlocks: jest.fn() }))

import api from '../src/services/api'
import { fetchBlocks } from '../src/services/nearby'
import { CITY_DIRECTORY_LIMIT, useCityDirectory } from '../src/hooks/useCityDirectory'
import { useMapFocus } from '../src/hooks/useMapFocus'

const tick = async (times = 6) => {
  for (let i = 0; i < times; i += 1) await act(async () => { await Promise.resolve() })
}

function DirectoryProbe({ options, out }) {
  out.push(useCityDirectory(options))
  return null
}

function FocusProbe({ blocks, out }) {
  out.push(useMapFocus(blocks))
  return null
}

async function mount(element) {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(element)
  })
  return renderer
}

afterEach(() => jest.clearAllMocks())

describe('useCityDirectory', () => {
  it('asks for the whole city, capped, and only while the map needs it', async () => {
    api.get.mockResolvedValue({ data: { items: [{ _id: 'brand1' }] } })
    const out = []
    const renderer = await mount(<DirectoryProbe options={{ cityId: 'c1', kind: 'stores', enabled: true, q: 'lawn' }} out={out} />)
    await tick()

    expect(api.get).toHaveBeenCalledWith('/discover', { params: { cityId: 'c1', scope: 'city', limit: CITY_DIRECTORY_LIMIT, q: 'lawn' } })
    expect(out.at(-1)).toEqual([{ _id: 'brand1' }])
    await act(async () => renderer.unmount())
  })

  it('reads providers from the services directory and passes the category', async () => {
    api.get.mockResolvedValue({ data: { items: [] } })
    const out = []
    const renderer = await mount(<DirectoryProbe options={{ cityId: 'c1', kind: 'providers', enabled: true, categoryId: 'cat1' }} out={out} />)
    await tick()

    expect(api.get).toHaveBeenCalledWith('/services/discover', { params: { cityId: 'c1', scope: 'city', limit: CITY_DIRECTORY_LIMIT, categoryId: 'cat1' } })
    await act(async () => renderer.unmount())
  })

  it('stays quiet while the layer is off, and reads a failed request as empty', async () => {
    const out = []
    const renderer = await mount(<DirectoryProbe options={{ cityId: 'c1', kind: 'stores', enabled: false }} out={out} />)
    await tick()
    expect(api.get).not.toHaveBeenCalled()
    expect(out.at(-1)).toBeNull()
    await act(async () => renderer.unmount())

    api.get.mockRejectedValue(new Error('offline'))
    const second = []
    const failed = await mount(<DirectoryProbe options={{ cityId: 'c1', kind: 'stores', enabled: true }} out={second} />)
    await tick()
    expect(second.at(-1)).toEqual([])
    await act(async () => failed.unmount())
  })
})

describe('useMapFocus', () => {
  const BLOCKS = [{ _id: 'b1', polygon: [[31.39, 73.09], [31.41, 73.11]] }]
  const city = (over = {}) => ({ cities: [], city: { _id: 'c1', name: 'Faisalabad' }, cityId: 'c1', setCityId: jest.fn(), ready: true, ...over })

  const renderFocus = async (blocks, cityValue) => {
    const out = []
    const renderer = await mount(
      <CityContext.Provider value={cityValue}>
        <FocusProbe blocks={blocks} out={out} />
      </CityContext.Provider>,
    )
    await tick()
    return { out, renderer }
  }

  it('frames the city already selected without asking the server again', async () => {
    const cityValue = city()
    const { out, renderer } = await renderFocus(BLOCKS, cityValue)

    await act(async () => out.at(-1).chooseCity('c1'))
    await tick()

    expect(cityValue.setCityId).not.toHaveBeenCalled()
    expect(fetchBlocks).not.toHaveBeenCalled()
    expect(out.at(-1).focus.bounds).toEqual({ south: 31.39, north: 31.41, west: 73.09, east: 73.11 })
    await act(async () => renderer.unmount())
  })

  it('switches city, then frames the new city’s blocks', async () => {
    const cityValue = city()
    fetchBlocks.mockResolvedValue([{ _id: 'b2', latitude: 31.5, longitude: 74.3 }])
    const { out, renderer } = await renderFocus(BLOCKS, cityValue)

    await act(async () => {
      await out.at(-1).chooseCity('c2')
    })

    expect(cityValue.setCityId).toHaveBeenCalledWith('c2')
    expect(fetchBlocks).toHaveBeenCalledWith('c2')
    expect(out.at(-1).focus.bounds).toEqual({ south: 31.5, north: 31.5, west: 74.3, east: 74.3 })
    await act(async () => renderer.unmount())
  })

  it('does not jump to a city that was replaced before its blocks arrived', async () => {
    let release
    fetchBlocks.mockImplementation((id) =>
      id === 'c2'
        ? new Promise((resolve) => {
            release = () => resolve([{ _id: 'b2', latitude: 31.5, longitude: 74.3 }])
          })
        : Promise.resolve([{ _id: 'b3', latitude: 31.6, longitude: 74.4 }]),
    )
    const { out, renderer } = await renderFocus(BLOCKS, city())

    let slow
    await act(async () => {
      slow = out.at(-1).chooseCity('c2')
    })
    await act(async () => {
      await out.at(-1).chooseCity('c3')
    })
    await act(async () => {
      release()
      await slow
    })

    expect(out.at(-1).focus.bounds).toEqual({ south: 31.6, north: 31.6, west: 74.4, east: 74.4 })
    await act(async () => renderer.unmount())
  })

  it('leaves the map to frame itself when the block list cannot be loaded', async () => {
    fetchBlocks.mockRejectedValue(new Error('offline'))
    const { out, renderer } = await renderFocus(BLOCKS, city())

    await act(async () => {
      await out.at(-1).chooseCity('c2')
    })

    expect(out.at(-1).focus).toBeNull()
    await act(async () => renderer.unmount())
  })
})
