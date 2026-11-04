const {
  validateRing,
  pointInRing,
  innerPoint,
  toGeoJsonPolygon,
  ringFromGeoJson,
  areaKm2,
  selfIntersects,
} = require('../src/utils/polygon');
const { computeBlockIds } = require('../src/utils/blockMembership');

// About 1 km by 1 km in Faisalabad. Corners are [lat, lng].
const SQUARE = [
  [31.4, 73.09],
  [31.4, 73.1],
  [31.409, 73.1],
  [31.409, 73.09],
];
// A "U": the centroid of this shape falls in the notch, outside the shape.
const U_SHAPE = [
  [31.4, 73.09],
  [31.4, 73.11],
  [31.412, 73.11],
  [31.412, 73.104],
  [31.402, 73.104],
  [31.402, 73.096],
  [31.412, 73.096],
  [31.412, 73.09],
];

describe('validateRing', () => {
  it('accepts a simple outline and reports its size', () => {
    const result = validateRing(SQUARE);
    expect(result.ok).toBe(true);
    expect(result.ring).toHaveLength(4);
    expect(result.areaKm2).toBeGreaterThan(0.8);
    expect(result.areaKm2).toBeLessThan(1.1);
  });

  it('drops a repeated closing corner', () => {
    expect(validateRing([...SQUARE, SQUARE[0]]).ring).toHaveLength(4);
  });

  it('accepts concave shapes', () => {
    expect(validateRing(U_SHAPE).ok).toBe(true);
  });

  it.each([
    ['fewer than three corners', [[31.4, 73.09], [31.41, 73.1]], /at least 3/],
    ['edges that cross', [[31.4, 73.09], [31.409, 73.1], [31.4, 73.1], [31.409, 73.09]], /crosses itself/],
    ['a repeated corner', [[31.4, 73.09], [31.4, 73.09], [31.409, 73.1], [31.409, 73.09]], /same place/],
    ['a sliver', [[31.4, 73.09], [31.4, 73.0901], [31.4001, 73.0901]], /too small/],
    ['a region too large to be a neighbourhood', [[30, 72], [30, 74], [32, 74], [32, 72]], /too large/],
    ['an impossible latitude', [[95, 73.09], [31.4, 73.1], [31.409, 73.1]], /valid/],
    ['text instead of numbers', [['a', 'b'], [31.4, 73.1], [31.409, 73.1]], /valid/],
    ['not a list', 'nope', /list of points/],
  ])('rejects %s', (_label, points, message) => {
    const result = validateRing(points);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });

  it('rejects more than 100 corners', () => {
    const many = Array.from({ length: 101 }, (_, i) => {
      const angle = (i / 101) * 2 * Math.PI;
      return [31.4 + 0.01 * Math.sin(angle), 73.09 + 0.01 * Math.cos(angle)];
    });
    expect(validateRing(many).ok).toBe(false);
    expect(validateRing(many).message).toMatch(/at most 100/);
  });
});

describe('selfIntersects and areaKm2', () => {
  it('detects a bow-tie but not a square', () => {
    expect(selfIntersects(SQUARE)).toBe(false);
    expect(selfIntersects([[31.4, 73.09], [31.409, 73.1], [31.4, 73.1], [31.409, 73.09]])).toBe(true);
  });

  it('measures area in square kilometres whichever way the outline is drawn', () => {
    expect(areaKm2(SQUARE)).toBeCloseTo(areaKm2([...SQUARE].reverse()), 3);
    expect(areaKm2(SQUARE)).toBeCloseTo(0.95, 1);
  });
});

describe('pointInRing', () => {
  it('knows inside from outside', () => {
    expect(pointInRing(31.4045, 73.095, SQUARE)).toBe(true);
    expect(pointInRing(31.42, 73.095, SQUARE)).toBe(false);
    expect(pointInRing(31.4045, 73.2, SQUARE)).toBe(false);
  });

  it('handles a concave shape (the notch of the U is outside)', () => {
    expect(pointInRing(31.406, 73.1, U_SHAPE)).toBe(false); // in the notch
    expect(pointInRing(31.406, 73.093, U_SHAPE)).toBe(true); // left arm
    expect(pointInRing(31.406, 73.107, U_SHAPE)).toBe(true); // right arm
    expect(pointInRing(31.401, 73.1, U_SHAPE)).toBe(true); // the base
  });
});

describe('innerPoint', () => {
  it('is the middle of a simple shape', () => {
    const { lat, lng } = innerPoint(SQUARE);
    expect(lat).toBeCloseTo(31.4045, 3);
    expect(lng).toBeCloseTo(73.095, 3);
  });

  it('stays inside a concave shape whose centroid is outside it', () => {
    const { lat, lng } = innerPoint(U_SHAPE);
    expect(pointInRing(lat, lng, U_SHAPE)).toBe(true);
  });
});

describe('GeoJSON conversion', () => {
  it('closes the ring, swaps to [lng, lat] and keeps a counter-clockwise outline', () => {
    const polygon = toGeoJsonPolygon(SQUARE);
    const ring = polygon.coordinates[0];
    expect(polygon.type).toBe('Polygon');
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
    // counter-clockwise: positive signed area in (lng, lat)
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    expect(sum).toBeGreaterThan(0);
  });

  it('turns a clockwise outline around, and round-trips back to open [lat, lng] pairs', () => {
    const clockwise = [...SQUARE].reverse();
    const polygon = toGeoJsonPolygon(clockwise);
    const back = ringFromGeoJson(polygon);
    expect(back).toHaveLength(4);
    expect(new Set(back.map((p) => p.join(',')))).toEqual(new Set(SQUARE.map((p) => p.join(','))));
    expect(ringFromGeoJson(undefined)).toBeNull();
  });
});

describe('computeBlockIds (which blocks hold a shop)', () => {
  const geo = (ring) => toGeoJsonPolygon(ring);
  const west = { _id: 'west', isActive: true, area: geo([[31.4, 73.09], [31.4, 73.1], [31.409, 73.1], [31.409, 73.09]]) };
  const east = { _id: 'east', isActive: true, area: geo([[31.4, 73.096], [31.4, 73.106], [31.409, 73.106], [31.409, 73.096]]) };
  const legacy = { _id: 'legacy', isActive: true }; // a block with no outline
  const pin = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

  it('puts a shop in one block, in two where zones overlap, and in none in a gap', () => {
    expect(computeBlockIds(pin(31.4045, 73.092), 'west', [west, east])).toEqual(['west']);
    expect(computeBlockIds(pin(31.4045, 73.098), 'west', [west, east])).toEqual(['west', 'east']);
    expect(computeBlockIds(pin(31.4045, 73.104), 'east', [west, east])).toEqual(['east']);
    expect(computeBlockIds(pin(31.5, 73.5), 'west', [west, east])).toEqual([]);
  });

  it('ignores inactive blocks', () => {
    expect(computeBlockIds(pin(31.4045, 73.098), 'west', [west, { ...east, isActive: false }])).toEqual(['west']);
  });

  it("holds a legacy centre-only block's shops by their home block only", () => {
    expect(computeBlockIds(pin(31.4045, 73.092), 'legacy', [west, legacy])).toEqual(['west', 'legacy']);
    expect(computeBlockIds(pin(31.4045, 73.092), 'west', [west, legacy])).toEqual(['west']);
  });
});
