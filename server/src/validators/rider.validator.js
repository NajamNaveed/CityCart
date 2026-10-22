const { z } = require('zod');

const MIN_PASSWORD_LENGTH = 8;

const phone = z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Invalid phone number');
const password = z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);

// Only RIDER accounts can be created here: the role and the brand are never
// client-supplied (docs/02 §19, docs/20 §5). A phone number is required: the
// customer and the brand need to be able to reach the rider.
const createRiderSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email('invalid email format'),
  password,
  phone,
});

const updateRiderSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: phone.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });

const resetRiderPasswordSchema = z.object({ password });

const listRidersQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = { createRiderSchema, updateRiderSchema, resetRiderPasswordSchema, listRidersQuerySchema };
