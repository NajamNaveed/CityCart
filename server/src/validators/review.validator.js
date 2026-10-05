const mongoose = require('mongoose');
const { z } = require('zod');

const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), { message: 'Invalid id.' });
const rating = z.number().int().min(1).max(5);
const title = z.string().trim().max(100);
const comment = z.string().trim().max(2000);

const paging = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
};

// A customer reviews one product from one of their delivered orders.
const createReviewSchema = z.object({
  orderId: objectId,
  productId: objectId,
  rating,
  title: title.optional(),
  comment: comment.optional(),
});

const updateReviewSchema = z
  .object({ rating: rating.optional(), title: title.optional(), comment: comment.optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update.' });

const listReviewsQuerySchema = z.object({ ...paging });

// Comma-separated product ids, e.g. ?productIds=a,b,c
const summaryQuerySchema = z.object({ productIds: z.string().trim().min(1).max(2000) });

const myReviewsQuerySchema = z.object({ orderId: objectId.optional() });

const brandReviewsQuerySchema = z.object({
  ...paging,
  rating: z.coerce.number().int().min(1).max(5).optional(),
  productId: objectId.optional(),
});

const adminReviewsQuerySchema = z.object({
  ...paging,
  rating: z.coerce.number().int().min(1).max(5).optional(),
  brandId: objectId.optional(),
  approved: z.enum(['true', 'false']).optional(),
});

const setApprovalSchema = z.object({ isApproved: z.boolean() });

module.exports = {
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
  summaryQuerySchema,
  myReviewsQuerySchema,
  brandReviewsQuerySchema,
  adminReviewsQuerySchema,
  setApprovalSchema,
};