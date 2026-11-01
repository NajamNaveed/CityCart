const { z } = require('zod');

const text = (max) => z.string().trim().min(1, 'This field is required').max(max);

const fields = {
  label: text(40),
  fullName: text(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Invalid phone number'),
  addressLine: text(300),
  city: text(100),
  state: text(100),
  postalCode: text(20),
  country: text(100),
  additionalInstructions: z.string().trim().max(2000, 'Delivery notes are too long.'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean(),
};

const createAddressSchema = z.object({
  label: fields.label,
  fullName: fields.fullName,
  phone: fields.phone,
  addressLine: fields.addressLine,
  city: fields.city,
  state: fields.state.optional(),
  postalCode: fields.postalCode.optional(),
  country: fields.country.optional(),
  additionalInstructions: fields.additionalInstructions.optional(),
  latitude: fields.latitude,
  longitude: fields.longitude,
  isDefault: fields.isDefault.optional(),
});

const updateAddressSchema = z
  .object({
    label: fields.label,
    fullName: fields.fullName,
    phone: fields.phone,
    addressLine: fields.addressLine,
    city: fields.city,
    state: fields.state,
    postalCode: fields.postalCode,
    country: fields.country,
    additionalInstructions: fields.additionalInstructions,
    // The pin moves as a pair.
    latitude: fields.latitude,
    longitude: fields.longitude,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' })
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: 'latitude and longitude must be sent together.',
    path: ['latitude'],
  });

module.exports = { createAddressSchema, updateAddressSchema };
