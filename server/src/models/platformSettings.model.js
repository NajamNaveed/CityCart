const mongoose = require('mongoose');

const { BILLING_DEFAULTS } = require('../config/billing');

const bankDetailsSchema = new mongoose.Schema(
  {
    bankName: { type: String, trim: true, maxlength: 120, default: '' },
    accountTitle: { type: String, trim: true, maxlength: 120, default: '' },
    accountNumber: { type: String, trim: true, maxlength: 60, default: '' },
    iban: { type: String, trim: true, maxlength: 40, default: '' },
    instructions: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { _id: false }
);

const billingSettingsSchema = new mongoose.Schema(
  {
    rateBps: { type: Number, min: 0, max: 10000, default: BILLING_DEFAULTS.rateBps },
    dueDays: { type: Number, min: 0, max: 90, default: BILLING_DEFAULTS.dueDays },
    restrictAfterDays: { type: Number, min: 0, max: 90, default: BILLING_DEFAULTS.restrictAfterDays },
    freezeAfterDays: { type: Number, min: 0, max: 180, default: BILLING_DEFAULTS.freezeAfterDays },
    minimumInvoicePaisa: { type: Number, min: 0, default: BILLING_DEFAULTS.minimumInvoicePaisa },
    bank: { type: bankDetailsSchema, default: () => ({}) },
  },
  { _id: false }
);

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
    billing: { type: billingSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);