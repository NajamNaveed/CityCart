const mongoose = require('mongoose');

/**
 * ServiceAvailability — one document per provider (docs/24 §4.4).
 *
 * Windows are weekly and expressed in Karachi wall-clock minutes so a
 * provider never has to think about UTC:
 *   weekday 0 = Sunday … 6 = Saturday
 *   startMinute 540 = 09:00, endMinute 1080 = 18:00
 * `slotMinutes` is the step the booking form offers.
 *
 * `blackoutDates` are whole local days the provider is unavailable
 * ('YYYY-MM-DD', Asia/Karachi). A customer request must fall inside a window
 * on a day that is not blacked out.
 */
const windowSchema = new mongoose.Schema(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
      validate: {
        validator(value) {
          return value > this.startMinute;
        },
        message: 'A window must end after it starts.',
      },
    },
    slotMinutes: { type: Number, default: 60, min: 15, max: 240 },
  },
  { _id: false }
);

const serviceAvailabilitySchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProvider',
      required: true,
      unique: true,
    },
    windows: { type: [windowSchema], default: [] },
    blackoutDates: { type: [String], default: [] },
  },
  { timestamps: true }
);

const ServiceAvailability = mongoose.model('ServiceAvailability', serviceAvailabilitySchema);
ServiceAvailability.MAX_BLACKOUT_DATES = 60;

module.exports = ServiceAvailability;
