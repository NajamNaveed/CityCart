const mongoose = require('mongoose');
const { z } = require('zod');
const { ALL_ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const MIN_PASSWORD_LENGTH = 8;

const permissionList = z
  .array(z.enum(ALL_ADMIN_PERMISSIONS, { error: 'Unknown admin permission' }))
  .max(ALL_ADMIN_PERMISSIONS.length)
  .refine((list) => new Set(list).size === list.length, { message: 'Duplicate permissions' });

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid id' });

const phone = z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Invalid phone number');

// The role is never client-supplied: this endpoint only ever creates
// ADMIN_PARTNER accounts (docs/21 §G.2).
const createPartnerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email('invalid email format'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  phone: phone.optional(),
  permissions: permissionList.optional(),
  readOnly: z.boolean().optional(),
});

const updatePartnerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: phone.optional(),
    permissions: permissionList.optional(),
    readOnly: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });

const resetPartnerPasswordSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

const listPartnersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  actor: objectId.optional(),
});

module.exports = {
  createPartnerSchema,
  updatePartnerSchema,
  resetPartnerPasswordSchema,
  listPartnersQuerySchema,
  listActivityQuerySchema,
};
