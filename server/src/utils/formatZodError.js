/**
 * Shared Zod error formatter, matching the convention already
 * established in controllers/auth.controller.js (kept there untouched;
 * this is the same shape, factored out for reuse by the new Phase 6
 * controllers rather than each one redefining it).
 */
function formatZodError(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

module.exports = { formatZodError };