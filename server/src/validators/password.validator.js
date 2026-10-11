const { z } = require('zod');

const MIN_PASSWORD_LENGTH = 8;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_BCRYPT_PASSWORD_BYTES, {
        message: `New password must be no more than ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes.`,
      }),
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match.',
    path: ['confirmPassword'],
  });

module.exports = { changePasswordSchema };