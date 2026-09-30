const mongoose = require('mongoose');

/**
 * Atomic sequence counters (e.g. `order-2026` -> order numbers,
 * docs/08 §4). `_id` is the counter name.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
