const mongoose = require('mongoose');
const { z } = require('zod');
const { latitude, longitude } = require('./block.validator');
const { PROVIDER_STATUSES } = require('../config/serviceProviderStatuses');

const PHONE = /^\+?[0-9][0-9\s-]{6,19}$/;
const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id.' });
const phone = z.string().trim().regex(PHONE, 'Invalid phone number');
const name = (label, max = 100) => z.string().trim().min(2, `${label} must be at least 2 characters`).max(max);

// Money is stored in paisa (PKR minor units), matching the billing rules in
// docs/24 §5.1. The client converts the rupees it displays.
const price = z
  .number()
  .int('startingAtPrice must be a whole number of paisa')
  .min(0, 'startingAtPrice cannot be negative')
  .max(1_000_000_000, 'startingAtPrice is too large');

/**
 * Self-service provider sign-up. Status, verification, role and the tenant
 * are never accepted from the client; the server derives them.
 *
 * The pin is required because the provider's service area is their block and
 * the pin is how the block membership is checked (same rule as a shop).
 */
const serviceApplicationSchema = z.object({
  owner: z.object({
    name: name('owner name'),
    email: z.string().trim().toLowerCase().email('invalid email format'),
    password: z.string().min(8, 'password must be at least 8 characters').max(128),
    phone,
  }),
  provider: z.object({
    displayName: name('display name'),
    legalName: name('legal name', 150).optional(),
    categoryId: objectId,
    cityId: objectId,
    blockId: objectId,
    addressLine: z.string().trim().max(300).optional(),
    phone: phone.optional(),
    bio: z.string().trim().max(1000).optional(),
    avatar: z.string().trim().max(500).optional(),
    coverImage: z.string().trim().max(500).optional(),
    startingAtPrice: price,
    latitude,
    longitude,
  }),
});

const updateServiceProfileSchema = z
  .object({
    displayName: name('display name'),
    legalName: name('legal name', 150).nullable(),
    phone: phone.nullable(),
    bio: z.string().trim().max(1000).nullable(),
    addressLine: z.string().trim().max(300),
    avatar: z.string().trim().max(500).nullable(),
    coverImage: z.string().trim().max(500).nullable(),
    startingAtPrice: price,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

// A pin is always required with a block: a home-based provider must not
// silently fall back to the block centre after moving.
const changeServiceBlockSchema = z.object({
  blockId: objectId,
  latitude,
  longitude,
});

const adminListProvidersQuerySchema = z.object({
  status: z.enum(PROVIDER_STATUSES).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const adminProviderStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']),
    reason: z.string().trim().min(5, 'reason must be at least 5 characters').max(500).optional(),
  })
  .refine((data) => data.status === 'ACTIVE' || Boolean(data.reason), {
    message: 'A reason is required when suspending or terminating a provider.',
    path: ['reason'],
  });

module.exports = {
  serviceApplicationSchema,
  updateServiceProfileSchema,
  changeServiceBlockSchema,
  adminListProvidersQuerySchema,
  adminProviderStatusSchema,
};
