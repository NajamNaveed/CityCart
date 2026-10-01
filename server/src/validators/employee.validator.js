const mongoose = require('mongoose');
const { z } = require('zod');
const { ALL_PERMISSIONS } = require('../config/permissions');

const MIN_PASSWORD_LENGTH = 8;

const permissionList = z
  .array(z.enum(ALL_PERMISSIONS, { error: 'Unknown permission' }))
  .max(ALL_PERMISSIONS.length)
  .refine((list) => new Set(list).size === list.length, { message: 'Duplicate permissions' });

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id' });

// Only BRAND_EMPLOYEE accounts can be created here — the role is never
// client-supplied (docs/02 §19).
const createEmployeeSchema = z.object({
  brandId: objectId.optional(), // honored for SUPER_ADMIN only
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email('invalid email format'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Invalid phone number').optional(),
  jobTitle: z.string().trim().min(1).max(100).optional(),
  permissions: permissionList.optional(),
});

const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Invalid phone number').optional(),
    jobTitle: z.string().trim().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });

const updatePermissionsSchema = z.object({ permissions: permissionList });

const listEmployeesQuerySchema = z.object({
  brandId: objectId.optional(), // SUPER_ADMIN filter only
  isActive: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = {
  createEmployeeSchema,
  updateEmployeeSchema,
  updatePermissionsSchema,
  listEmployeesQuerySchema,
};
