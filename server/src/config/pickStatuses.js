// How far the picker got on one order line (docs/22 §E).
//   PICKED      the full ordered quantity is in the bag
//   SHORT       fewer units were found; pickedQty says how many
//   UNAVAILABLE nothing usable was found
const PICK_STATUSES = ['PICKED', 'SHORT', 'UNAVAILABLE'];

module.exports = { PICK_STATUSES };
