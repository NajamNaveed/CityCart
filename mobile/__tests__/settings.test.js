import api from '../src/services/api'
import { DEFAULT_SETTINGS, fetchPublicSettings, resetPublicSettings } from '../src/services/settings'

jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

beforeEach(() => {
  jest.clearAllMocks()
  resetPublicSettings()
})

describe('fetchPublicSettings', () => {
  it('fills in the safe defaults around what the server sends', async () => {
    api.get.mockResolvedValue({ data: { settings: { supportEmail: 'help@citycart.pk' } } })

    await expect(fetchPublicSettings()).resolves.toEqual({ ...DEFAULT_SETTINGS, supportEmail: 'help@citycart.pk' })
    expect(api.get).toHaveBeenCalledWith('/settings/public')
  })

  it('asks once and shares the answer', async () => {
    api.get.mockResolvedValue({ data: { settings: { supportEmail: 'help@citycart.pk' } } })

    const [first, second] = await Promise.all([fetchPublicSettings(), fetchPublicSettings()])
    await fetchPublicSettings()

    expect(first).toBe(second)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('falls back to the defaults when the server cannot be reached', async () => {
    api.get.mockRejectedValue(new Error('offline'))

    await expect(fetchPublicSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })
})
