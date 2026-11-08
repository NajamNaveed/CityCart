const { z } = require('zod');

const { objectId, numberFromQuery } = require('./block.validator');
const {
  SERVICE_BOOKING_STATUSES,
  MAX_PROPOSAL_EXPIRY_HOURS,
} = require('../config/serviceBookingStatuses');

const MAX_PAISA = 1_000_000_000;

const dateTime = z
  .string()
  .trim()
  .min(1, 'Choose a date and time.')
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), { message: 'Use a valid date and time.' });

const pricePaisa = z
  .number()
  .int('Price must be a whole number of paisa.')
  .min(0, 'Price cannot be negative.')
  .max(MAX_PAISA, 'Price is too large.');

// A customer offer is a bargaining position, so it must be a real amount.
const offerPaisa = z
  .number()
  .int('The offer must be a whole number of paisa.')
  .min(1, 'Enter the amount you want to pay.')
  .max(MAX_PAISA, 'The offer is too large.');

const page = numberFromQuery
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 1000, { message: 'page must be between 1 and 1000.' })
  .optional();
const limit = numberFromQuery
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 30, { message: 'limit must be between 1 and 30.' })
  .optional();

const address = z
  .object({
    fullName: z.string().trim().min(2, 'Enter the name of the person to meet.').max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a phone number the provider can call.'),
    addressLine: z.string().trim().min(5, 'Enter the full address.').max(300),
    city: z.string().trim().max(80).optional(),
  })
  .strict();

const location = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

// The provider, customer and binding price are never accepted from the client:
// only the offering, the requested time and where the job happens. The optional
// customerOfferPaisa is the customer's own bargaining position, recorded so the
// provider can accept that exact amount.
const createBookingSchema = z
  .object({
    providerId: objectId,
    offeringId: objectId,
    scheduledStart: dateTime,
    address,
    location,
    note: z.string().trim().max(1000).optional(),
    customerOfferPaisa: offerPaisa.optional(),
  })
  .strict();

const providerAcceptSchema = z.object({ pricePaisa }).strict();

const providerDeclineSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();

const providerProposeSchema = z
  .object({
    pricePaisa,
    scope: z.string().trim().min(3, 'Describe what the price includes.').max(1000),
    scheduledStart: dateTime,
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(MAX_PROPOSAL_EXPIRY_HOURS, `A proposal can stay open for at most ${MAX_PROPOSAL_EXPIRY_HOURS} hours.`)
      .optional(),
  })
  .strict();

const providerCompleteSchema = z
  .object({
    finalAmountPaisa: pricePaisa,
    completionNote: z.string().trim().max(1000).optional(),
  })
  .strict();

const cancelBookingSchema = z
  .object({ reason: z.string().trim().min(3, 'Tell the other side why.').max(500) })
  .strict();

const disputeSchema = z
  .object({ reason: z.string().trim().min(5, 'Tell us what went wrong.').max(1000) })
  .strict();

const resolveDisputeSchema = z
  .object({
    resolution: z.enum(['CONFIRMED', 'CANCELLED']),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

const listBookingsQuerySchema = z.object({
  status: z.enum(SERVICE_BOOKING_STATUSES).optional(),
  page,
  limit,
});

const adminListBookingsQuerySchema = z.object({
  status: z.enum(SERVICE_BOOKING_STATUSES).optional(),
  disputed: z.enum(['true', 'false']).optional(),
  providerId: objectId.optional(),
  page,
  limit,
});

const bookingIdParamSchema = z.object({ id: objectId });

module.exports = {
  createBookingSchema,
  providerAcceptSchema,
  providerDeclineSchema,
  providerProposeSchema,
  providerCompleteSchema,
  cancelBookingSchema,
  disputeSchema,
  resolveDisputeSchema,
  listBookingsQuerySchema,
  adminListBookingsQuerySchema,
  bookingIdParamSchema,
  dateTime,
};
