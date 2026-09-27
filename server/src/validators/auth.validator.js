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

module.exports = { registerSchema, loginSchema };