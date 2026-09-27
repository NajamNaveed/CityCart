/**
 * Centralized Brand status constants, per docs/04-database-design.md §9
 * (Brand Model) and docs/01-product-requirements.md §8 (Brand states).
 *
 * brand.model.js imports this rather than defining its own copy — same
 * pattern used for role constants (see config/roles.js), so the schema
 * enum and any validator/service that needs the same list can't drift
 * out of sync.
 */
const BRAND_STATUSES = Object.freeze(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']);

module.exports = { BRAND_STATUSES };