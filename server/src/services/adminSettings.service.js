const PlatformSettings = require('../models/platformSettings.model');

const SETTINGS_KEY = 'platform';

async function getPlatformSettings() {
  const settings = await PlatformSettings.findOne({ key: SETTINGS_KEY });
  return settings || new PlatformSettings();
}

async function updatePlatformSettings(changes) {
  const fields = { ...changes };
  const announcement = fields.announcement;
  delete fields.announcement;
  if (announcement) {
    for (const [name, value] of Object.entries(announcement)) {
      fields[`announcement.${name}`] = value;
    }
  }

  return PlatformSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: fields, $setOnInsert: { key: SETTINGS_KEY } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

module.exports = { getPlatformSettings, updatePlatformSettings };