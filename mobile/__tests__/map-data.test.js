import { buildMapData } from '../src/components/map/mapData'
import { MAP_HTML } from '../src/components/map/mapHtml'

const ZONE = { _id: 'zone-1', name: 'Gulberg', polygon: [[31.39, 73.09], [31.41, 73.09], [31.41, 73.11], [31.39, 73.11]] }
const BRAND = {
  _id: 'brand-1',
  name: 'Loom & Co.',
  branches: [
    { _id: 'branch-1', name: 'Gulberg shop', blockName: 'Gulberg', address: 'Main Boulevard', latitude: 31.401, longitude: 73.101, distanceKm: 1.2 },
    { _id: 'branch-2', name: 'No pin', latitude: null, longitude: null },
  ],
}

describe('buildMapData', () => {
  it('passes the zones, shop pins and distances the WebView draws', () => {
    const data = buildMapData({ items: [BRAND], zones: [ZONE], selectedIds: ['zone-1'], origin: { lat: 31.4, lng: 73.1 }, radiusKm: '2', pickable: true })

    expect(data.zones).toEqual([{ id: 'zone-1', name: 'Gulberg', ring: ZONE.polygon, selected: true }])
    expect(data.pins).toEqual([
      {
        brandId: 'brand-1',
        brandName: 'Loom & Co.',
        branchName: 'Gulberg shop',
        where: 'Gulberg · Main Boulevard',
        distance: '1.2 km away',
        lat: 31.401,
        lng: 73.101,
      },
    ])
    expect(data.pin).toEqual({ lat: 31.4, lng: 73.1, label: 'Search centre', kind: 'origin' })
    expect(data.radiusKm).toBe(2)
    expect(data.pickable).toBe(true)
  })

  it('prefers a dropped pin and labels it, and ignores malformed zones', () => {
    const data = buildMapData({
      pin: { lat: 31.43, lng: 73.08 },
      origin: { lat: 31.4, lng: 73.1 },
      zones: [{ _id: 'bad', name: 'No shape' }, ZONE],
      originLabel: 'Delivery spot',
    })

    expect(data.pin).toEqual({ lat: 31.43, lng: 73.08, label: 'Delivery spot', kind: 'pin' })
    expect(data.zones).toHaveLength(1)
    expect(data.radiusKm).toBe(0)
    expect(data.pickable).toBe(false)
  })
})

describe('the WebView map', () => {
  it('draws OpenStreetMap tiles and talks to React Native, with no Google Maps', () => {
    expect(MAP_HTML).toContain('https://tile.openstreetmap.org/')
    expect(MAP_HTML).toContain('openstreetmap.org/copyright')
    expect(MAP_HTML).toContain('window.CityCartMap')
    expect(MAP_HTML).toContain('ReactNativeWebView')
    expect(MAP_HTML.toLowerCase()).not.toContain('google')
  });

  it('pans by moving one layer, flings, and zooms without a blank frame', () => {
    // Dragging translates the tile/zone/mark layer instead of redrawing it.
    expect(MAP_HTML).toContain('translate3d(')
    expect(MAP_HTML).toContain('will-change: transform')
    expect(MAP_HTML).toContain('requestAnimationFrame')
    // A pinch scales the layer continuously instead of re-rendering per step.
    expect(MAP_HTML).toContain('scale(')
    // The previous level shows, stretched, until the new zoom's tiles arrive.
    expect(MAP_HTML).toContain('id="under"')
    expect(MAP_HTML).toContain('id="zoom-in"')
    expect(MAP_HTML).toContain('id="zoom-out"')
    // The search centre is a dot, like the Leaflet map on the website.
    expect(MAP_HTML).toContain("data.pin.kind === 'origin'")
    // A shared rider is a moving dot, updated without refitting the camera.
    expect(MAP_HTML).toContain("dotMarker(data.rider.lat, data.rider.lng, 'Your rider'")
    expect(MAP_HTML).toContain('setRider: function (lat, lng)')
    expect(MAP_HTML).toContain('if (state.data.rider && !shown) fit();')
  })
})
