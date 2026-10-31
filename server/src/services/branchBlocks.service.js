const Block = require('../models/block.model');
const Branch = require('../models/branch.model');
const { computeBlockIds } = require('../utils/blockMembership');

/**
 * Keeps `Branch.blockIds` right (Marketplace v2, Phase 2, docs/22).
 *
 * A shop belongs to every ACTIVE block whose boundary contains its pin, so a shop
 * standing in the overlap of two blocks is found in both. A block with no boundary
 * (legacy, centre only) holds just the shops whose home block it is.
 */

/** For a shop being created or moved: its blocks, given its home block. */
async function blockIdsForPin(location, homeBlock) {
  const blocks = await Block.find({ cityId: homeBlock.cityId, isActive: true });
  return computeBlockIds(location, homeBlock._id, blocks);
}

const sameIds = (a, b) => {
  const x = (a || []).map(String).sort();
  const y = (b || []).map(String).sort();
  return x.length === y.length && x.every((id, i) => id === y[i]);
};

/**
 * Recomputes the blocks of every shop in a city, after a boundary changed or a
 * block was switched on or off. Returns how many shops changed and how many now
 * sit in no block at all (so the admin can be told).
 */
async function recomputeCityBranches(cityId) {
  const blocks = await Block.find({ cityId });
  const branches = await Branch.find({ blockId: { $in: blocks.map((b) => b._id) } });

  const operations = [];
  let withoutBlock = 0;
  for (const branch of branches) {
    const ids = computeBlockIds(branch.location, branch.blockId, blocks);
    if (ids.length === 0) withoutBlock += 1;
    if (!sameIds(ids, branch.blockIds)) {
      operations.push({ updateOne: { filter: { _id: branch._id }, update: { $set: { blockIds: ids } } } });
    }
  }
  if (operations.length > 0) {
    await Branch.bulkWrite(operations);
  }
  return { updated: operations.length, branchesWithoutBlock: withoutBlock };
}

module.exports = { computeBlockIds, blockIdsForPin, recomputeCityBranches };
