const mongoose = require('mongoose');
const { z } = require('zod');
const { BRAND_STATUSES } = require('../config/brandStatuses');
const { latitude, longitude } = require('./block.validator');

const PHONE = /^\+?[0-9][0-9\s-]{6,19}$/;
const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id.' });
const phone = z.string().trim().regex(PHONE, 'Invalid phone number');
const name = (label) => z.string().trim().min(2, `${label} must be at least 2 characters`).max(100);

/**
 * The data a seller must provide to open a shop. If ANY required field is
 * missing or invalid the application is rejected and nothing is created.
 * status/role/brandId are never accepted from the client.
 *
 * REQUIRED  owner:  name, email, password (8+), phone
 *           brand:  name, cityId, description (10+ chars)
 *           branch: name, blockId (the shop's area in that city)
 * OPTIONAL  logo/cover/banner URLs, brand contact, branch address/phone/pin
 *
 * The first branch IS the shop customers discover; the old separate "store"
 * section duplicated data customers never saw and has been removed. The pin
 * is optional and defaults to the middle of the block, exactly like the
 * dashboard branch editor.
 */
const brandApplicationSchema = z
  .object({
  owner: z.object({
    name: name('owner name'),
    email: z.string().trim().toLowerCase().email('invalid email format'),
    password: z.string().min(8, 'password must be at least 8 characters').max(128),
    phone,
  }),
  brand: z.object({
    name: name('brand name'),
    cityId: objectId,
    description: z.string().trim().min(10, 'description must be at least 10 characters').max(1000),
    logo: z.string().trim().max(500).optional(),
    coverImage: z.string().trim().max(500).optional(),
    contact: z
      .object({
        email: z.string().trim().email().optional(),
        phone: phone.optional(),
        website: z.string().trim().max(200).optional(),
      })
      .optional(),
  }),
  branch: z.object({
    name: name('shop name'),
    blockId: objectId,
    address: z.string().trim().max(300).optional(),
    phone: phone.optional(),
    // Optional; without them the shop sits at the block centre.
    latitude: latitude.optional(),
    longitude: longitude.optional(),
  }),
}).refine((data) => (data.branch.latitude === undefined) === (data.branch.longitude === undefined), {
  message: 'latitude and longitude must be sent together.',
  path: ['branch.latitude'],
});

const checkNameQuerySchema = z.object({ name: z.string().trim().min(2).max(100) });

const terminateBrandSchema = z.object({
  reason: z.string().trim().min(10, 'reason must be at least 10 characters').max(500),
  // Hours the brand's staff keep read-only access (0 = cut off immediately).
  // Omit to use TERMINATION_GRACE_HOURS (default 24).
  graceHours: z.number().int().min(0).max(168).optional(),
});

const adminListBrandsQuerySchema = z.object({
  status: z.enum(BRAND_STATUSES).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = {
  brandApplicationSchema,
  checkNameQuerySchema,
  terminateBrandSchema,
  adminListBrandsQuerySchema,
};
