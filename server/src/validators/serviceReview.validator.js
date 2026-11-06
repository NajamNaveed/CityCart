const { z } = require('zod');

const { objectId, numberFromQuery } = require('./block.validator');
const ServiceMessage = require('../models/serviceMessage.model');
const ServiceReview = require('../models/serviceReview.model');

const rating = z.number().int().min(1, 'Choose a rating from 1 to 5.').max(5);

const createServiceReviewSchema = z
  .object({
    rating,
    comment: z.string().trim().max(ServiceReview.MAX_COMMENT_LENGTH).optional(),
  })
  .strict();

const replyToReviewSchema = z
  .object({ body: z.string().trim().min(1, 'Write a reply.').max(ServiceMessage.MAX_BODY_LENGTH) })
  .strict();

const ratingFromQuery = z
  .string()
  .trim()
  .regex(/^[1-5]$/, 'rating must be 1–5.')
  .transform(Number)
  .optional();

const page = numberFromQuery
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 1000, { message: 'page must be between 1 and 1000.' })
  .optional();
const limit = numberFromQuery
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 30, { message: 'limit must be between 1 and 30.' })
  .optional();

const listProviderReviewsQuerySchema = z.object({ rating: ratingFromQuery, page, limit });

const adminListServiceReviewsQuerySchema = z.object({
  approved: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  providerId: objectId.optional(),
  rating: ratingFromQuery,
  page,
  limit,
});

const setServiceReviewApprovalSchema = z.object({ isApproved: z.boolean() }).strict();

const serviceReviewParamSchema = z.object({ id: objectId });
const bookingParamSchema = z.object({ id: objectId });

module.exports = {
  createServiceReviewSchema,
  replyToReviewSchema,
  listProviderReviewsQuerySchema,
  adminListServiceReviewsQuerySchema,
  setServiceReviewApprovalSchema,
  serviceReviewParamSchema,
  bookingParamSchema,
};
