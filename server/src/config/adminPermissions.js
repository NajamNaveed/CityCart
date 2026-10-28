/**
 * Admin-area permissions for platform-admin partners, per
 * docs/21-next-features-plan.md §G.2 ("Next Features" — feature G).
 *
 * Each permission is one admin area. Reads are always allowed to a partner
 * who holds the area; writes additionally require that the partner is not
 * read-only (AdminPartner.readOnly is enforced in
 * middleware/requireAdminPermission.js). This keeps the eight names the plan
 * specifies instead of splitting every area into two permissions.
 *
 * The SUPER_ADMIN holds every one of these implicitly and is not stored.
 */
const ADMIN_PERMISSIONS = Object.freeze({
  BRANDS: 'admin.brands', // review applications, suspend, terminate, edit
  USERS: 'admin.users',
  ORDERS: 'admin.orders',
  REVIEWS: 'admin.reviews',
  LOCATIONS: 'admin.locations', // cities and blocks (areas)
  SETTINGS: 'admin.settings',
  ANALYTICS: 'admin.analytics',
  PAYMENTS: 'admin.payments', // gateway review list and payment status
});

const ALL_ADMIN_PERMISSIONS = Object.values(ADMIN_PERMISSIONS);

// Presets for the partner form (docs/21 §G.2, §G.5 decisions 2).
const ADMIN_PRESETS = Object.freeze({
  FULL: Object.freeze({
    key: 'FULL',
    label: 'Full partner',
    permissions: ALL_ADMIN_PERMISSIONS,
    readOnly: false,
  }),
  READ_ONLY: Object.freeze({
    key: 'READ_ONLY',
    label: 'Read only',
    permissions: ALL_ADMIN_PERMISSIONS,
    readOnly: true,
  }),
});

const ADMIN_PRESET_LIST = Object.values(ADMIN_PRESETS);

module.exports = { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS, ADMIN_PRESETS, ADMIN_PRESET_LIST };
