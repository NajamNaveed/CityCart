const mongoose = require('mongoose');
const { z } = require('zod');

/**
 * Shared route-param validation for Mongo ObjectIds, per AGENTS.md §12
 * (Validation — "Validate: ... Route parameters. IDs.").
 *
 * Used by City/Brand/Store routes (and available to future resources)
 * so ObjectId validation isn't reimplemented per resource.
 */
const objectIdParamSchema = z.object({
  id: z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: 'Invalid id.',
  }),
});

module.exports = { objectIdParamSchema };