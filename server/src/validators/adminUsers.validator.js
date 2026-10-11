const { z } = require('zod');
const { ALL_ROLES } = require('../config/roles');

const adminUsersQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    role: z.enum(ALL_ROLES).optional(),
    isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

module.exports = { adminUsersQuerySchema };