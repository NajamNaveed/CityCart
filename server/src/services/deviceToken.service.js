const DeviceToken = require('../models/deviceToken.model');

// A person rarely has more than a couple of phones; this bounds the table and the pushes sent.
const MAX_TOKENS_PER_USER = 5;

// Expo push tokens look like ExponentPushToken[xxxx] (older) or ExpoPushToken[xxxx].
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;

/**
 * Saves (or moves) a phone's push token for the signed-in user. Safe to call on every app
 * start. If the token belonged to someone else, it now belongs to this user only.
 */
async function registerToken({ userId, token, platform = 'unknown' }) {
  await DeviceToken.findOneAndUpdate(
    { token },
    { $set: { userId, platform, lastSeenAt: new Date() } },
    { upsert: true }
  );
  // Keep only the newest few phones of this user.
  const mine = await DeviceToken.find({ userId }).sort({ lastSeenAt: -1 }).select('_id');
  if (mine.length > MAX_TOKENS_PER_USER) {
    await DeviceToken.deleteMany({ _id: { $in: mine.slice(MAX_TOKENS_PER_USER).map((t) => t._id) } });
  }
}

// Sign-out: only the caller's own token can be removed this way.
async function removeToken({ userId, token }) {
  await DeviceToken.deleteOne({ userId, token });
}

module.exports = { registerToken, removeToken, TOKEN_PATTERN, MAX_TOKENS_PER_USER };
