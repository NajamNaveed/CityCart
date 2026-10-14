const { z } = require('zod');

const { objectId } = require('./block.validator');

const MAX_BODY_LENGTH = 1000;

const body = z
  .string({ error: 'A message is required.' })
  .trim()
  .min(1, 'A message is required.')
  .max(MAX_BODY_LENGTH, `A message can be at most ${MAX_BODY_LENGTH} characters.`);

const wholeNumber = (max) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'Must be a whole number.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= max, { message: `Must be between 1 and ${max}.` });

// .strict(): unknown keys (a client trying to set senderId, brandId,
// customerId, role...) are rejected instead of silently ignored.
const startChatSchema = z.object({ productId: objectId, body }).strict();

const sendMessageSchema = z.object({ body, productId: objectId.optional() }).strict();

const listChatsQuerySchema = z.object({
  page: wholeNumber(1000).optional(),
  limit: wholeNumber(30).optional(),
});

const listMessagesQuerySchema = z.object({
  before: objectId.optional(),
  limit: wholeNumber(50).optional(),
});

module.exports = {
  startChatSchema,
  sendMessageSchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
  MAX_BODY_LENGTH,
};
