import renderer, { act } from 'react-test-renderer'
import OfflineBanner from '../src/components/OfflineBanner'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)

// NetInfo is captured so a test can simulate the OS dropping the connection.
let mockNetInfoListener = null
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (cb) => {
      mockNetInfoListener = cb
      return () => {
        mockNetInfoListener = null
      }
    },
    fetch: () => Promise.resolve({ isConnected: true }),
  },
}))

function connection(isConnected) {
  act(() => mockNetInfoListener({ isConnected }))
}

function screenText(tree) {
  return tree.root
    .findAllByType('Text')
    .map((node) => node.children.join(''))
    .join(' ')
}

afterEach(() => {
  act(() => {
    renderer.act(() => {})
  })
})

describe('OfflineBanner', () => {
  it('shows nothing while the connection state is unknown (launch)', () => {
    let tree
    act(() => {
      tree = renderer.create(<OfflineBanner />)
    })
    expect(screenText(tree)).not.toContain('No internet connection')
  })

  it('appears when the OS reports the device as disconnected', () => {
    let tree
    act(() => {
      tree = renderer.create(<OfflineBanner />)
    })
    connection(false)
    expect(screenText(tree)).toContain('No internet connection')
  })

  it('disappears again when the connection comes back', () => {
    let tree
    act(() => {
      tree = renderer.create(<OfflineBanner />)
    })
    connection(false)
    connection(true)
    expect(screenText(tree)).not.toContain('No internet connection')
  })

  it('stops listening when unmounted', () => {
    let tree
    act(() => {
      tree = renderer.create(<OfflineBanner />)
    })
    act(() => {
      tree.unmount()
    })
    expect(mockNetInfoListener).toBeNull()
  })
})
