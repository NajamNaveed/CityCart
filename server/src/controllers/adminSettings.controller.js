const { platformSettingsSchema } = require('../validators/adminSettings.validator');
const { getPlatformSettings, updatePlatformSettings } = require('../services/adminSettings.service');
const { formatZodError } = require('../utils/formatZodError');

async function getSettings(req, res, next) {
  try {
    const settings = await getPlatformSettings();
    return res.status(200).json({ success: true, settings });
  } catch (err) {
    return next(err);
  }
}

async function patchSettings(req, res, next) {
  const parsedBody = platformSettingsSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const settings = await updatePlatformSettings(parsedBody.data);
    return res.status(200).json({ success: true, message: 'Platform settings updated', settings });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSettings, patchSettings };