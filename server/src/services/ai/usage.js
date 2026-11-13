const AiUsage = require('../../models/aiUsage.model');

/**
 * Usage logging and the daily counter (docs/27 §3.1, §3.2). Logging must never
 * break a generation: a failed insert is a warning, not an error the caller
 * sees.
 */
async function recordAiUsage({
  userId = null,
  role = null,
  agent = null,
  provider = null,
  model = null,
  promptTokens = 0,
  completionTokens = 0,
  attempts = 0,
  ms = 0,
  ok = false,
  error = null,
} = {}) {
  try {
    await AiUsage.create({
      userId: userId || null,
      role: role || null,
      agent: agent || null,
      provider: provider || null,
      model: model || null,
      promptTokens: Number(promptTokens) || 0,
      completionTokens: Number(completionTokens) || 0,
      attempts: Number(attempts) || 0,
      ms: Number(ms) || 0,
      ok: Boolean(ok),
      error: error ? String(error).slice(0, 300) : null,
    });
  } catch (err) {
    console.warn(`[ai] usage log failed: ${err.message}`);
  }
}

/**
 * Requests made by a user since 00:00 UTC. Counts failed attempts too, so a
 * retry storm cannot slip past the daily cap.
 */
async function countUsageToday(userId, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  try {
    return await AiUsage.countDocuments({ userId, createdAt: { $gte: start } });
  } catch (err) {
    console.warn(`[ai] usage count failed: ${err.message}`);
    return 0;
  }
}

module.exports = { recordAiUsage, countUsageToday };
