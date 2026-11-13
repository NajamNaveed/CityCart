const mongoose = require('mongoose');

/**
 * Short-lived AI results (docs/27 §3.1): review summaries, translations and
 * other answers that only change when their input changes. `expiresAt` has a
 * TTL index so MongoDB removes old rows by itself; the read path still checks
 * the timestamp because TTL deletion is not instant.
 */
const aiCacheSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiCache = mongoose.model('AiCache', aiCacheSchema);

module.exports = AiCache;
