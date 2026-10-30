import { useEffect, useRef } from 'react'
import { Linking, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors } from '../theme'
import { formatDistance } from '../utils/geo'

// Free map: Leaflet drawing OpenStreetMap tiles inside a web view. It needs no API key,
// no billing account and no Google services, and it looks the same on Android and iPhone.
// Leaflet is loaded from cdnjs (pinned to 1.9.4), so the map needs an internet connection.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4'
// OpenStreetMap asks apps to send a Referer; this is also the page's base address.
const BASE_URL = 'https://city-cart-mocha.vercel.app'

// Page text and attributes are always set with textContent / DOM calls, never innerHTML,
// because brand and branch names are typed by sellers.
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
  window.renderMap = function (d) {
    layer.clearLayers();
    var pts = [];
    if (d.origin && d.radiusKm) {
      L.circle([d.origin.lat, d.origin.lng], { radius: d.radiusKm * 1000, color: d.colors.ring, weight: 1, fillColor: d.colors.ring, fillOpacity: 0.08 }).addTo(layer);
    }
    if (d.origin) {
      var here = document.createElement('div');
      here.textContent = d.origin.label;
      L.circleMarker([d.origin.lat, d.origin.lng], { radius: 8, color: '#fff', weight: 2, fillColor: d.colors.origin, fillOpacity: 1 }).addTo(layer).bindPopup(here);
      pts.push([d.origin.lat, d.origin.lng]);
    }
    d.pins.forEach(function (p) {
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
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], animate: false });
    else if (pts.length === 1) map.setView(pts[0], 15, { animate: false });
  };
})();
</script></body></html>`

/**
 * Shop locations as pins, the search centre, and the search radius. `items` are
 * the brands on screen; tapping a pin opens a label whose button opens that brand's products.
 */
export default function NearbyMap({ items, origin, radiusKm, originLabel, onOpenBrand }) {
  const webRef = useRef(null)
  const loaded = useRef(false)

  const pins = items.flatMap((brand) =>
    brand.branches.map((branch) => ({
      brandId: String(brand._id),
      lat: branch.latitude,
      lng: branch.longitude,
      title: brand.name,
      sub: [branch.name, branch.distanceKm != null ? `${formatDistance(branch.distanceKm)} away` : ''].filter(Boolean).join(' · '),
    })),
  )
  const payload = JSON.stringify({
    pins,
    origin: origin ? { lat: origin.lat, lng: origin.lng, label: originLabel || 'Search centre' } : null,
    radiusKm: radiusKm || null,
    colors: { pin: colors.clay, origin: '#3b5b7c', ring: colors.pine },
  })

  const push = () => {
    if (loaded.current && webRef.current) webRef.current.injectJavaScript(`window.renderMap && window.renderMap(${payload}); true;`)
  }
  useEffect(push, [payload])

  const onMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data)
      if (message.type !== 'brand') return
      const brand = items.find((b) => String(b._id) === message.id)
      if (brand) onOpenBrand(brand)
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
    <View accessibilityLabel="Map of nearby shops" style={{ height: 420, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
      <WebView
        ref={webRef}
        source={{ html: PAGE, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onLoadEnd={() => {
          loaded.current = true
          push()
        }}
        onMessage={onMessage}
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
