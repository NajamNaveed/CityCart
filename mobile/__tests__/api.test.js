import axios from 'axios'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
}))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

// config.js reads the environment when it loads, so each test loads a fresh copy.
function loadApi(url = 'https://api.example.com') {
  let loaded
  const previous = process.env.EXPO_PUBLIC_API_URL
  if (url === null) delete process.env.EXPO_PUBLIC_API_URL // null = nothing configured
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
    if (status >= 400) {
      throw new axios.AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response)
    }
    return response
  }
  return sent
}

const authHeader = (config) => config.headers.get('Authorization')

describe('requests', () => {
  it('always identify as the mobile app and use the configured server', async () => {
    const api = loadApi()
    const sent = fakeNetwork(api)

    await api.default.get('/cities')

    expect(sent[0].headers.get('X-Client')).toBe('mobile')
    expect(sent[0].baseURL).toBe('https://api.example.com/api/v1')
  })

  it('carry the stored token as a Bearer header, and send none when signed out', async () => {
    const api = loadApi()
    const sent = fakeNetwork(api)

    await api.default.get('/products')
    expect(authHeader(sent[0])).toBeFalsy()

    await api.tokenStore.set('my.jwt.token')
    await api.default.get('/products')
    expect(authHeader(sent[1])).toBe('Bearer my.jwt.token')

    await api.tokenStore.clear()
    await api.default.get('/products')
    expect(authHeader(sent[2])).toBeFalsy()
  })

  it('fail with a clear message, and send nothing, when no server is configured', async () => {
    const api = loadApi(null)
    const sent = fakeNetwork(api)

    const error = await api.default.get('/cities').catch((e) => e)

    expect(sent).toHaveLength(0)
    expect(error.notConfigured).toBe(true)
    expect(api.getErrorMessage(error)).toMatch(/EXPO_PUBLIC_API_URL/)
  })
})

describe('a session that ended on the server', () => {
  it('signs the user out when a request that carried a token gets a 401', async () => {
    const api = loadApi()
    fakeNetwork(api, 401, { success: false, message: 'Invalid or expired session.' })
    const onUnauthorized = jest.fn()
    api.setUnauthorizedHandler(onUnauthorized)
    await api.tokenStore.set('old.token')

    await api.default.get('/orders').catch(() => {})

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not treat a wrong password, an anonymous 401 or other errors as a lost session', async () => {
    const api = loadApi()
    const onUnauthorized = jest.fn()
    api.setUnauthorizedHandler(onUnauthorized)

    // wrong password: a 401 from the login endpoint itself, even if an old token is around
    fakeNetwork(api, 401)
    await api.tokenStore.set('old.token')
    await api.default.post('/auth/login', {}).catch(() => {})
    await api.default.post('/auth/register', {}).catch(() => {})

    // a 401 with no token was never a session
    await api.tokenStore.clear()
    await api.default.get('/orders').catch(() => {})

    // other failures
    await api.tokenStore.set('good.token')
    fakeNetwork(api, 500)
    await api.default.get('/orders').catch(() => {})
    fakeNetwork(api, 403)
    await api.default.get('/orders').catch(() => {})

    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('error messages', () => {
  const { getErrorMessage, getFieldErrors } = loadApi()
  const failure = (status, data) => ({ response: { status, data } })

  it('use the server message when there is one', () => {
    expect(getErrorMessage(failure(400, { message: 'Email already registered.' }))).toBe('Email already registered.')
  })

  it('explain the other cases in plain words', () => {
    expect(getErrorMessage({})).toMatch(/Cannot reach the server/)
    expect(getErrorMessage({ code: 'ECONNABORTED' })).toMatch(/too long/)
    expect(getErrorMessage(failure(429, {}))).toMatch(/Too many attempts/)
    expect(getErrorMessage(failure(403, { code: 'WEB_ONLY', message: 'x' }))).toMatch(/website/)
    expect(getErrorMessage(failure(500, {}), 'Fallback text')).toBe('Fallback text')
  })

  it('turn a field error list into an object for forms', () => {
    const err = failure(400, { errors: [{ field: 'email', message: 'Invalid email' }, { field: 'password', message: 'Too short' }] })
    expect(getFieldErrors(err)).toEqual({ email: 'Invalid email', password: 'Too short' })
    expect(getFieldErrors(failure(400, {}))).toEqual({})
    expect(getFieldErrors(undefined)).toEqual({})
  })
})
