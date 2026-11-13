const env = require('../config/env');
const { countUsageToday } = require('../services/ai/usage');

/**
 * Phase 0 connectivity check. It answers only for a signed-in user, does not
 * call a provider and does not consume the daily allowance, so the web/app can
 * show "AI is off / out of quota" states without spending a request.
 */
async function ping(req, res, next) {
  try {
    const usedToday = await countUsageToday(req.user._id);
    return res.status(200).json({
      success: true,
      data: {
        dailyLimit: env.ai.dailyLimit,
        usedToday,
        remaining: Math.max(0, env.ai.dailyLimit - usedToday),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { ping };
