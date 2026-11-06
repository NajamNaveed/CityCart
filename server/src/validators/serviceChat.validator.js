const { z } = require('zod');

const { objectId, numberFromQuery } = require('./block.validator');
const ServiceMessage = require('../models/serviceMessage.model');

const attachment = z.string().trim().min(1).max(500);

const sendMessageSchema = z
  .object({
    body: z
      .string({ error: 'A message is required.' })
      .trim()
      .min(1, 'A message is required.')
      .max(ServiceMessage.MAX_BODY_LENGTH, `A message can be at most ${ServiceMessage.MAX_BODY_LENGTH} characters.`),
    attachments: z.array(attachment).max(ServiceMessage.MAX_ATTACHMENTS).optional(),
  })
  .strict();

const listMessagesQuerySchema = z.object({
  before: objectId.optional(),
  limit: numberFromQuery
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 50, { message: 'limit must be between 1 and 50.' })
    .optional(),
});

const listServiceChatsQuerySchema = z.object({
  page: numberFromQuery
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 1000, { message: 'page must be between 1 and 1000.' })
    .optional(),
  limit: numberFromQuery
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 30, { message: 'limit must be between 1 and 30.' })
    .optional(),
});

const bookingChatParamSchema = z.object({ id: objectId });

module.exports = {
  sendMessageSchema,
  listMessagesQuerySchema,
  listServiceChatsQuerySchema,
  bookingChatParamSchema,
};
