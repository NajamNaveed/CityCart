const { z } = require('zod');

const ServiceAvailability = require('../models/serviceAvailability.model');
const { MAX_WINDOWS } = require('../services/serviceAvailability.service');

const weekday = z.number().int().min(0).max(6);
const startMinute = z.number().int().min(0).max(1439);
const endMinute = z.number().int().min(1).max(1440);
const slotMinutes = z.number().int().min(15).max(240);

const window = z
  .object({ weekday, startMinute, endMinute, slotMinutes })
  .refine((w) => w.endMinute > w.startMinute, {
    message: 'The end of a window must be after its start.',
    path: ['endMinute'],
  });

// Karachi calendar days, the same key the availability service compares.
const blackoutDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Use a real calendar date.');

const replaceAvailabilitySchema = z
  .object({
    windows: z
      .array(window)
      .max(MAX_WINDOWS, `At most ${MAX_WINDOWS} weekly windows are allowed.`)
      .default([]),
    blackoutDates: z
      .array(blackoutDate)
      .max(ServiceAvailability.MAX_BLACKOUT_DATES, `At most ${ServiceAvailability.MAX_BLACKOUT_DATES} blackout dates are allowed.`)
      .default([]),
  })
  .strict();

module.exports = { replaceAvailabilitySchema };
