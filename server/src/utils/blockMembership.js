const { latLngFromPoint } = require('./geo');
const { pointInRing, ringFromGeoJson } = require('./polygon');

/**
 * Which blocks hold a shop (pure, no database): every ACTIVE block whose boundary
 * contains the shop's pin, plus (for a legacy block with no boundary) the shop's
 * own home block. `blocks` are one city's blocks, as documents or plain objects.
 */
function computeBlockIds(location, homeBlockId, blocks) {
  const { lat, lng } = latLngFromPoint(location);
  const ids = [];
  for (const block of blocks) {
    if (!block.isActive) continue;
    if (block.area) {
      const ring = ringFromGeoJson(block.area);
      if (ring && pointInRing(lat, lng, ring)) ids.push(block._id);
    } else if (String(block._id) === String(homeBlockId)) {
      ids.push(block._id);
    }
  }
  return ids;
}

module.exports = { computeBlockIds };
