const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const City = require('../../src/models/city.model');
const Block = require('../../src/models/block.model');
const Brand = require('../../src/models/brand.model');
const Branch = require('../../src/models/branch.model');
const { discover } = require('../../src/services/discover.service');
const { pointFromLatLng } = require('../../src/utils/geo');

// A radius search must only return branches that really are within that many
// kilometres of the origin, and the distance shown for each one must match.
const ORIGIN = { lat: 31.41819, lng: 73.07865 };
const DEGREE_KM = 111.32;
const near = (km) => pointFromLatLng(ORIGIN.lat + km / DEGREE_KM, ORIGIN.lng);

let city;
let block;

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearAll();
  city = await City.create({ name: 'Faisalabad', slug: 'faisalabad' });
  block = await Block.create({
    cityId: city._id,
    name: 'Clock Tower',
    slug: 'clock-tower',
    center: pointFromLatLng(ORIGIN.lat, ORIGIN.lng),
  });
});

async function addShop(name, km) {
  const brand = await Brand.create({ name, slug: name.toLowerCase().replace(/\W+/g, '-'), cityId: city._id, status: 'ACTIVE' });
  await Branch.create({
    brandId: brand._id,
    blockId: block._id,
    blockIds: [block._id],
    name: `${name} shop`,
    location: near(km),
  });
  return brand;
}

const branchOf = (result, brand) => result.items.find((item) => item.name === brand.name).branches[0];

describe('discovery radius against a real 2dsphere index', () => {
  it('returns only branches inside the radius, with matching distances', async () => {
    const close = await addShop('Nearby Co', 1);
    const far = await addShop('Faraway Co', 5);

    const twoKm = await discover({ scope: 'radius', radiusKm: 2, lat: ORIGIN.lat, lng: ORIGIN.lng, cityId: String(city._id) });
    expect(twoKm.items.map((item) => item.name)).toEqual(['Nearby Co']);
    expect(branchOf(twoKm, close).distanceKm).toBe(1);
    expect(twoKm.items.find((item) => item.name === far.name)).toBeUndefined();

    const sixKm = await discover({ scope: 'radius', radiusKm: 6, lat: ORIGIN.lat, lng: ORIGIN.lng, cityId: String(city._id) });
    expect(sixKm.items.map((item) => item.name)).toEqual(['Nearby Co', 'Faraway Co']);
    expect(branchOf(sixKm, far).distanceKm).toBe(5);
  });

  it('uses the chosen block centre when the shopper sent no position', async () => {
    await addShop('Nearby Co', 1);
    await addShop('Faraway Co', 5);

    const result = await discover({ scope: 'area', blockIds: [String(block._id)], radiusKm: 2, cityId: String(city._id) });

    expect(result.meta.origin).toEqual(ORIGIN);
    expect(result.meta.radiusKm).toBe(2);
    expect(result.items.map((item) => item.name)).toEqual(['Nearby Co']);
  });
});
