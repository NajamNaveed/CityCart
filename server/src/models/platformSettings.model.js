const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'platform' },
    platformName: { type: String, trim: true, default: 'CityCart' },
    supportEmail: { type: String, trim: true, lowercase: true, default: '' },
    supportPhone: { type: String, trim: true, default: '' },
    commissionRate: { type: Number, min: 0, max: 100, default: null },
    codMaxOrderAmount: { type: Number, min: 0, default: null },
    brandOnboardingPolicy: {
      type: String,
      enum: ['MANUAL_APPROVAL', 'INSTANT_ACTIVATION'],
      default: 'INSTANT_ACTIVATION',
    },
    orderCancellationGraceMinutes: { type: Number, min: 0, default: null },
    announcement: {
      text: { type: String, trim: true, default: '' },
      enabled: { type: Boolean, default: false },
    },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);