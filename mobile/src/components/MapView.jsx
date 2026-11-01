import { useEffect, useRef } from 'react'
import { Linking, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors } from '../theme'

// Free map: Leaflet drawing OpenStreetMap tiles inside a web view. It needs no API key,
// no billing account and no Google services, and it looks the same on Android and iPhone.
// Leaflet is loaded from cdnjs (pinned to 1.9.4), so the map needs an internet connection.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4'
// OpenStreetMap asks apps to send a Referer; this is also the page's base address.
const BASE_URL = 'https://city-cart-mocha.vercel.app'

// What the page draws, from the data the app sends (all of it is data, never markup):
//   zones   [{ name, polygon: [[lat, lng], ...], color, selected }]   block outlines
//   pins    [{ brandId, lat, lng, title, sub }]                        shops, with a "View products" button
//   origin  { lat, lng, label } and radiusKm                           where a search is measured from
//   pin     { lat, lng }                                               a spot the shopper dropped
//   pickable  true: tapping the map sends { type: 'pick', lat, lng }
//   fitOnce   true: frame the map on the first draw only (so taps do not keep moving it)
// Page text is always set with textContent / DOM calls, never innerHTML, because brand,
// branch and block names are typed by sellers and admins.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.min.css">
<style>
html,body,#map{height:100%;margin:0;background:#f1efe9;font-family:sans-serif}
.leaflet-popup-content{font:13px/1.4 sans-serif;margin:10px 12px}
.leaflet-popup-content b{display:block}
.go{margin-top:8px;padding:8px 12px;border:0;border-radius:6px;background:#b6472a;color:#fff;font:600 12px sans-serif}
.msg{padding:24px;text-align:center;color:#555}
</style></head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.min.js"></script>
<script>
(function () {
  function send(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  if (typeof L === 'undefined') {
    document.getElementById('map').innerHTML = '<div class="msg">The map needs an internet connection.</div>';
    return;
  }
  var map = L.map('map').setView([31.4504, 73.135], 12);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var pickable = false;
  var fitted = false;
  map.on('click', function (e) {
    if (pickable) send({ type: 'pick', lat: e.latlng.lat, lng: e.latlng.lng });
  });
  window.renderMap = function (d) {
    layer.clearLayers();
    pickable = !!d.pickable;
    var pts = [];
    (d.zones || []).forEach(function (z) {
      if (!z.polygon) return;
      var shape = L.polygon(z.polygon, { color: z.color, weight: z.selected ? 2.5 : 1.5, fillColor: z.color, fillOpacity: z.selected ? 0.28 : 0.07, interactive: false }).addTo(layer);
      var name = document.createElement('span');
      name.textContent = z.name;
      shape.bindTooltip(name, { sticky: true });
      z.polygon.forEach(function (p) { pts.push(p); });
    });
    if (d.origin && d.radiusKm) {
      L.circle([d.origin.lat, d.origin.lng], { radius: d.radiusKm * 1000, color: d.colors.ring, weight: 1, fillColor: d.colors.ring, fillOpacity: 0.08, interactive: false }).addTo(layer);
    }
    if (d.origin) {
      var here = document.createElement('div');
      here.textContent = d.origin.label;
      L.circleMarker([d.origin.lat, d.origin.lng], { radius: 8, color: '#fff', weight: 2, fillColor: d.colors.origin, fillOpacity: 1 }).addTo(layer).bindPopup(here);
      pts.push([d.origin.lat, d.origin.lng]);
    }
    if (d.pin) {
      L.circleMarker([d.pin.lat, d.pin.lng], { radius: 10, color: '#fff', weight: 3, fillColor: d.colors.origin, fillOpacity: 1, interactive: false }).addTo(layer);
      pts.push([d.pin.lat, d.pin.lng]);
    }
    (d.pins || []).forEach(function (p) {
      var el = document.createElement('div');
      var title = document.createElement('b');
      title.textContent = p.title;
      el.appendChild(title);
      if (p.sub) {
        var sub = document.createElement('span');
        sub.textContent = p.sub;
        el.appendChild(sub);
      }
      var btn = document.createElement('button');
      btn.className = 'go';
      btn.textContent = 'View products';
      btn.onclick = function () { send({ type: 'brand', id: p.brandId }); };
      el.appendChild(btn);
      L.circleMarker([p.lat, p.lng], { radius: 10, color: '#fff', weight: 2, fillColor: d.colors.pin, fillOpacity: 1 }).addTo(layer).bindPopup(el);
      pts.push([p.lat, p.lng]);
    });
    if (d.fitOnce && fitted) return;
    if (pts.length > 1) { map.fitBounds(pts, { padding: [40, 40], animate: false }); fitted = true; }
    else if (pts.length === 1) { map.setView(pts[0], 15, { animate: false }); fitted = true; }
  };
})();
</script></body></html>`

export const MAP_COLORS = { pin: colors.clay, origin: '#3b5b7c', ring: colors.pine }
export const ZONE_COLORS = ['#b6472a', '#1e3a2f', '#3b5b7c', '#8a5a1c', '#6b3f7a', '#2f6f6f']

/**
 * The map web view. `data` is what to draw (see PAGE); it is pushed to the page whenever it
 * changes. `onMessage(message)` gets what the page sends: { type: 'brand', id } or { type: 'pick', lat, lng }.
 */
export default function MapView({ data, onMessage, label, height = 420 }) {
  const webRef = useRef(null)
  const loaded = useRef(false)
  const payload = JSON.stringify({ colors: MAP_COLORS, ...data })

  const push = () => {
    if (loaded.current && webRef.current) webRef.current.injectJavaScript(`window.renderMap && window.renderMap(${payload}); true;`)
  }
  useEffect(push, [payload])

  const handle = (event) => {
    try {
      onMessage?.(JSON.parse(event.nativeEvent.data))
    } catch {
      // not one of ours; ignore
    }
  }

  // The page never navigates away; the OpenStreetMap credit link opens in the phone's browser.
  const onShouldStartLoadWithRequest = (request) => {
    if (request.url === BASE_URL || request.url === `${BASE_URL}/` || request.url === 'about:blank') return true
    if (request.url.startsWith('https://www.openstreetmap.org/')) Linking.openURL(request.url)
    return false
  }

  return (
    <View accessibilityLabel={label} style={{ height, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
      <WebView
        ref={webRef}
        source={{ html: PAGE, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onLoadEnd={() => {
          loaded.current = true
          push()
        }}
        onMessage={handle}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        nestedScrollEnabled
        overScrollMode="never"
        style={{ flex: 1, backgroundColor: '#f1efe9' }}
      />
    </View>
  )
}
