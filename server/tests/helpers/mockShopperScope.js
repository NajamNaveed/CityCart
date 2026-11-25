/**
 * The shopper-scope stub the customer-agent suites share.
 *
 * Every customer assistant asks `resolveShopperScope` where the shopper is
 * before it searches, and that read goes to the Address, Block and City
 * collections. These suites mock the models they assert on but not those three,
 * so an unstubbed scope lookup stalls until mongoose gives up. Which blocks a
 * pin or a saved address actually falls in is tested in tests/ai/chatCorpus.test.js;
 * here the shopper has no saved place, so every search stays the city-wide one
 * the suites were written against — with the same city and coordinates the
 * request named, because the tools pass them straight through.
 */
function scopeFor({ cityId = null, lat = null, lng = null } = {}) {
  return {
    cityId,
    cityName: null,
    lat,
    lng,
    blockIds: [],
    blockNames: [],
    blocks: [],
    source: lat === null ? 'none' : 'pin',
    addressLabel: null,
    deliverable: lat === null ? null : false,
    hasLocation: lat !== null,
  };
}

// Used as `jest.mock('<...>/ai/location', () => require('../helpers/mockShopperScope').locationModule())`.
const locationModule = () => ({
  resolveShopperScope: jest.fn(async (args) => scopeFor(args)),
  findAreaBlocks: jest.fn().mockResolvedValue([]),
});

module.exports = { locationModule, scopeFor };
