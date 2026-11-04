// The real web view is a native module, so tests use this stand-in (Jest picks up a root
// __mocks__ file for a node module automatically). It remembers what the app sent to the
// page and lets a test act as the page by calling `__map.onMessage(...)`.
const React = require('react')
const { View } = require('react-native')

const __map = { scripts: [], onMessage: null }

const WebView = React.forwardRef(({ onLoadEnd, onMessage }, ref) => {
  __map.onMessage = onMessage
  React.useImperativeHandle(ref, () => ({ injectJavaScript: (script) => __map.scripts.push(script) }))
  React.useEffect(() => onLoadEnd && onLoadEnd(), [onLoadEnd])
  return React.createElement(View, { testID: 'map' })
})

/** What the app last sent the page to draw, parsed from the injected script. */
const lastMapData = () => {
  const script = __map.scripts.at(-1)
  return JSON.parse(script.slice(script.indexOf('renderMap(', script.indexOf('&&') + 2) + 'renderMap('.length, script.lastIndexOf('); true;')))
}

module.exports = { __esModule: true, WebView, __map, lastMapData }
