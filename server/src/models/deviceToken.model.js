const mongoose = require('mongoose');

/**
 * A phone that may receive push notifications for a user (docs/12 §31). The push token
 * is unique: if a phone is signed in as someone else, the token MOVES to that person, so
 * the previous user's notifications never reach it. Tokens are removed on sign-out and
 * when the push service reports the phone is gone.
 */
const deviceTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'unknown'], default: 'unknown' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
