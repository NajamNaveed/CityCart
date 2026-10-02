const mongoose = require('mongoose');
const { z } = require('zod');
const { BRAND_STATUSES } = require('../config/brandStatuses');

const PHONE = /^\+?[0-9][0-9\s-]{6,19}$/;
const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id.' });
const phone = z.string().trim().regex(PHONE, 'Invalid phone number');
const name = (label) => z.string().trim().min(2, `${label} must be at least 2 characters`).max(100);

/**
 * The data a seller must provide to open a store. If ANY required field is
 * missing or invalid the application is rejected and nothing is created.
 * status/role/brandId are never accepted from the client.
 *
 * REQUIRED  owner:  name, email, password (8+), phone
 *           brand:  name, cityId, description (10+ chars)
 *           store:  name, address.addressLine, address.city, contact.phone
 * OPTIONAL  logo/cover/banner URLs, brand contact, store description,
 *           address state/postalCode/country, contact email, business hours
 */
const brandApplicationSchema = z.object({
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
  store: z.object({
    name: name('store name'),
    description: z.string().trim().max(1000).optional(),
    logo: z.string().trim().max(500).optional(),
    banner: z.string().trim().max(500).optional(),
    address: z.object({
      addressLine: z.string().trim().min(5, 'addressLine must be at least 5 characters').max(300),
      city: z.string().trim().min(1).max(100),
      state: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().max(100).optional(),
    }),
    contact: z.object({
      phone,
      email: z.string().trim().email().optional(),
    }),
    businessHours: z.record(z.string(), z.unknown()).optional(),
  }),
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
