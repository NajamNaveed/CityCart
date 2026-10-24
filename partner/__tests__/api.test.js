import axios from 'axios'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
}))

// config.js reads the environment when it loads, so each test loads a fresh copy.
function loadApi(url = 'https://api.example.com') {
  let loaded
  const previous = process.env.EXPO_PUBLIC_API_URL
  if (url === null) delete process.env.EXPO_PUBLIC_API_URL
  else process.env.EXPO_PUBLIC_API_URL = url
  jest.isolateModules(() => {
    loaded = { ...require('../src/services/api'), tokenStore: require('../src/services/storage').tokenStore }
  })
  if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL
  else process.env.EXPO_PUBLIC_API_URL = previous
  return loaded
}

// A fake network: records what was sent and answers with a status.
function fakeNetwork(api, status = 200, data = { success: true }) {
  const sent = []
  api.default.defaults.adapter = async (config) => {
    sent.push(config)
    const response = { status, data, headers: {}, config, statusText: '' }
    if (status >= 400) throw new axios.AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
    return response
  }
  return sent
}

const httpError = (status, data = {}) => ({ response: { status, data } })

describe('requests', () => {
  it('always identify as the PARTNER app (not the shopper app) and use the configured server', async () => {
    const api = loadApi()
    const sent = fakeNetwork(api)

    await api.default.get('/rider/deliveries')

    expect(sent[0].headers.get('X-Client')).toBe('partner')
    expect(sent[0].baseURL).toBe('https://api.example.com/api/v1')
  })

  it('carry the stored token as a Bearer header, and none when signed out', async () => {
    const api = loadApi()
    const sent = fakeNetwork(api)

    await api.default.get('/auth/me')
    expect(sent[0].headers.get('Authorization')).toBeFalsy()

    await api.tokenStore.set('the.token')
    await api.default.get('/auth/me')
    expect(sent[1].headers.get('Authorization')).toBe('Bearer the.token')
  })

  it('fail clearly, without sending anything, when no server address is set', async () => {
    const api = loadApi(null)
    const sent = fakeNetwork(api)
    await expect(api.default.get('/x')).rejects.toMatchObject({ notConfigured: true })
    expect(sent).toHaveLength(0)
  })
})

describe('a session the server ended', () => {
  it('signs out on a 401 when a token was sent', async () => {
    const api = loadApi()
    const handler = jest.fn()
    api.setUnauthorizedHandler(handler)
    await api.tokenStore.set('old.token')
    fakeNetwork(api, 401)

    await expect(api.default.get('/rider/deliveries')).rejects.toBeDefined()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does NOT sign out for a wrong password at sign-in (also a 401)', async () => {
    const api = loadApi()
    const handler = jest.fn()
    api.setUnauthorizedHandler(handler)
    await api.tokenStore.set('old.token')
    fakeNetwork(api, 401)

    await expect(api.default.post('/auth/partner/login', {})).rejects.toBeDefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does nothing for a 401 when no token was sent', async () => {
    const api = loadApi()
    const handler = jest.fn()
    api.setUnauthorizedHandler(handler)
    fakeNetwork(api, 401)
    await expect(api.default.get('/x')).rejects.toBeDefined()
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('getErrorMessage', () => {
  const { getErrorMessage, getFieldErrors } = loadApi()

  it('explains partner-only and web-only refusals in plain words', () => {
    expect(getErrorMessage(httpError(403, { code: 'PARTNER_APP_ONLY', message: 'x' }))).toMatch(/Partner app/)
    expect(getErrorMessage(httpError(403, { code: 'WEB_ONLY', message: 'x' }))).toMatch(/website/)
  })

  it("uses the server's message, and a calm one when the server cannot be reached", () => {
    expect(getErrorMessage(httpError(409, { message: 'Delivery not found.' }))).toBe('Delivery not found.')
    expect(getErrorMessage(new Error('Network Error'))).toMatch(/Cannot reach the server/)
    expect(getErrorMessage({ code: 'ECONNABORTED' })).toMatch(/too long/)
  })

  it("keeps the server's own message for a 429 (it can be about a locked code)", () => {
    expect(getErrorMessage(httpError(429, { message: 'Too many wrong codes. Ask the brand to complete this delivery.' }))).toMatch(/wrong codes/)
    expect(getErrorMessage(httpError(429, {}))).toMatch(/Too many attempts/)
  })

  it('maps field errors for forms', () => {
    expect(getFieldErrors(httpError(400, { errors: [{ field: 'email', message: 'invalid' }] }))).toEqual({ email: 'invalid' })
    expect(getFieldErrors(httpError(400, {}))).toEqual({})
  })
})
