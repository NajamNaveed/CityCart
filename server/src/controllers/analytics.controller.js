const { analyticsQuerySchema, resolveDateRange } = require('../validators/analytics.validator');
const { getBrandAnalytics, getPlatformAnalytics } = require('../services/analytics.service');
const { formatZodError } = require('../utils/formatZodError');

function parseRange(req, res) {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
    return null;
  }
  return resolveDateRange(parsed.data);
}

async function brandAnalytics(req, res, next) {
  const range = parseRange(req, res);
  if (!range) return;
  try {
    const analytics = await getBrandAnalytics({ brandId: req.tenantBrandId, range });
    return res.status(200).json({ success: true, analytics });
  } catch (err) {
    return next(err);
  }
}

async function platformAnalytics(req, res, next) {
  const range = parseRange(req, res);
  if (!range) return;
  try {
    const analytics = await getPlatformAnalytics({ range });
    return res.status(200).json({ success: true, analytics });
  } catch (err) {
    return next(err);
  }
}

module.exports = { brandAnalytics, platformAnalytics };