const { z } = require('zod');

// docs/05 §21 + docs/12 §12: paginated, with a backend-enforced maximum.
const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = { listNotificationsQuerySchema };
