/**
 * Centralized role constants, per
 * docs/02-user-roles-and-permissions.md §2 (User Roles) and
 * AGENTS.md §8 (Authorization).
 *
 * This is the single source of truth for role names — user.model.js
 * imports ROLES/BRAND_SCOPED_ROLES from here rather than defining its
 * own copy, so the two can never drift out of sync.
 */
const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  BRAND_ADMIN: 'BRAND_ADMIN',
  BRAND_EMPLOYEE: 'BRAND_EMPLOYEE',
  CUSTOMER: 'CUSTOMER',
});

const ALL_ROLES = Object.values(ROLES);

// Roles that belong to exactly one brand (docs/02 §4 — Scope Model;
// docs/04-database-design.md §6 — User Constraints).
const BRAND_SCOPED_ROLES = Object.freeze([ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE]);

// Roles whose sessions are short-lived and per-tab (docs/06 §9 — staff
// session security): the brand dashboard and the platform admin panel.
const STAFF_ROLES = Object.freeze([ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.SUPER_ADMIN]);

module.exports = { ROLES, ALL_ROLES, BRAND_SCOPED_ROLES, STAFF_ROLES };