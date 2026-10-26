const mongoose = require('mongoose');

// How long the last known position is kept. After this it is deleted by the database itself,
// so a rider's position never lingers (docs/11 §30).
const KEEP_SECONDS = 2 * 60 * 60;

/**
 * The LAST known position of a rider who chose to share it while delivering. One document per
 * rider, replaced on every update: there is no location history. It is readable only for a
 * delivery that is out for delivery, by that order's customer and that brand's staff.
 */
const riderLocationSchema = new mongoose.Schema({
  riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number, min: 0 },
  recordedAt: { type: Date, required: true, default: Date.now, expires: KEEP_SECONDS },
});

const RiderLocation = mongoose.model('RiderLocation', riderLocationSchema);
RiderLocation.KEEP_SECONDS = KEEP_SECONDS;
module.exports = RiderLocation;
