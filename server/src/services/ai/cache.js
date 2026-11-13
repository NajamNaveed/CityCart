const AiCache = require('../../models/aiCache.model');

/**
 * Result cache for AI calls (docs/27 §3.1). A cache failure only costs a
 * provider call; it never fails the request.
 */
const DEFAULT_TTL_SECONDS = 60 * 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

async function getCached(key) {
  if (!key) return null;
  try {
    const doc = await AiCache.findOne({ key }).lean();
    if (!doc || !doc.expiresAt) return null;
    if (doc.expiresAt.getTime() <= Date.now()) return null;
    return doc.value === undefined ? null : doc.value;
  } catch (err) {
    console.warn(`[ai] cache read failed: ${err.message}`);
    return null;
  }
}

async function setCached(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!key) return;
  const requested = Number(ttlSeconds);
  const seconds =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_TTL_SECONDS)
      : DEFAULT_TTL_SECONDS;

  try {
    await AiCache.findOneAndUpdate(
      { key },
      { $set: { key, value, expiresAt: new Date(Date.now() + seconds * 1000) } },
      { upsert: true }
    );
  } catch (err) {
    console.warn(`[ai] cache write failed: ${err.message}`);
  }
}

module.exports = { getCached, setCached, DEFAULT_TTL_SECONDS };
