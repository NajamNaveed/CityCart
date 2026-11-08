const { getPlatformSettings } = require('../services/adminSettings.service');

// Only fields that are safe for an anonymous visitor. Billing, rates and
// operator settings stay behind the authenticated admin routes.
async function getPublicSettings(req, res, next) {
  try {
    const settings = await getPlatformSettings();
    return res.status(200).json({
      success: true,
      settings: {
        platformName: settings.platformName || 'CityCart',
        supportEmail: settings.supportEmail || '',
        supportPhone: settings.supportPhone || '',
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getPublicSettings };
