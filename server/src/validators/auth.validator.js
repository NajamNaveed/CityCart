const { z } = require('zod');

/**
 * Zod validation schemas for authentication input, per
 * docs/06-authentication-and-security.md §19 (Input Validation —
 * "CityCart will use: Zod") and §4 (Registration requirements).
 *
 * Minimum password length (8) is an implementation default: the docs
 * only say "a reasonable minimum length" without a specific number.
 */
const MIN_PASSWORD_LENGTH = 8;

const registerSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: z.string().trim().toLowerCase().email('invalid email format'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid email format'),
  password: z.string().min(1, 'password is required'),
});

// Which kind of account the request is about. Customers reset on the
// shopper sign-in page, brand owners on the seller sign-in page; keeping
// them apart matters because one email may hold both accounts.
const portalSchema = z.enum(['customer', 'brand']).optional().default('customer');

const emailRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email('invalid email format'),
  portal: portalSchema,
});

const tokenSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'invalid token'),
});

const resetPasswordSchema = tokenSchema.extend({
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(128, 'newPassword must be at most 128 characters'),
});

// A multi-brand employee's workspace step (docs/24 §3.3). The token is the
// signed proof that the password was already accepted; the brand is only a
// choice, and the server re-checks the membership.
const workspaceTokenSchema = z.object({
  workspaceToken: z.string().trim().min(1, 'workspaceToken is required'),
  brandId: z.string().trim().regex(/^[a-f0-9]{24}$/i, 'invalid brandId'),
});

const workspaceSwitchSchema = z.object({
  brandId: z.string().trim().regex(/^[a-f0-9]{24}$/i, 'invalid brandId'),
});

module.exports = {
  registerSchema,
  loginSchema,
  emailRequestSchema,
  tokenSchema,
  resetPasswordSchema,
  workspaceTokenSchema,
  workspaceSwitchSchema,
};