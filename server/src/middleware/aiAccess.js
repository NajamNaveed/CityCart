const env = require('../config/env');
const { AiUnavailableError } = require('../services/ai/errors');
const { countUsageToday } = require('../services/ai/usage');

/**
 * Guards for /api/v1/ai routes (docs/27 §6). Both run after `authenticate`, so
 * req.user is a database-fresh account and req.user._id is the only source of
 * the user id — never a body or query value.
 */
function requireAiEnabled(req, res, next) {
  if (!env.ai.enabled) {
    return next(new AiUnavailableError('disabled'));
  }
  return next();
}

/**
 * Refuses further AI work once the user has spent today's allowance. The
 * request that would exceed it is not counted; generation routes add a usage
 * row after they run, so the count moves on the next call.
 */
async function aiDailyLimit(req, res, next) {
  const used = await countUsageToday(req.user._id);
  const remaining = Math.max(0, env.ai.dailyLimit - used);

  res.set('X-AI-Daily-Limit', String(env.ai.dailyLimit));
  res.set('X-AI-Daily-Remaining', String(remaining));

  if (used >= env.ai.dailyLimit) {
    return res.status(429).json({
      success: false,
      message: 'Daily AI limit reached. Please try again tomorrow.',
      code: 'AI_DAILY_LIMIT',
      limit: env.ai.dailyLimit,
    });
  }

  return next();
}

module.exports = { requireAiEnabled, aiDailyLimit };
