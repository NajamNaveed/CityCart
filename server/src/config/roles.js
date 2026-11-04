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
  // A delegated platform admin (docs/21 §G): no brand, web only, and only
  // the admin areas the super admin ticked for them (AdminPartner.permissions).
  ADMIN_PARTNER: 'ADMIN_PARTNER',
  BRAND_ADMIN: 'BRAND_ADMIN',
  BRAND_EMPLOYEE: 'BRAND_EMPLOYEE',
  // The person who picks and packs an order in one brand (docs/22 §E). Signs
  // in only through the partner app and sees no customer phone or prices.
  PICKER: 'PICKER',
  // Delivery rider of ONE brand (docs/20). Signs in only through the partner app.
  RIDER: 'RIDER',
  CUSTOMER: 'CUSTOMER',
});

const ALL_ROLES = Object.values(ROLES);

// Roles that belong to exactly one brand (docs/02 §4 — Scope Model;
// docs/04-database-design.md §6 — User Constraints).
const BRAND_SCOPED_ROLES = Object.freeze([
  ROLES.BRAND_ADMIN,
  ROLES.BRAND_EMPLOYEE,
  ROLES.PICKER,
  ROLES.RIDER,
]);

// Roles whose sessions are short-lived and per-tab (docs/06 §9 — staff
// session security): the brand dashboard and the platform admin panel.
const STAFF_ROLES = Object.freeze([
  ROLES.BRAND_ADMIN,
  ROLES.BRAND_EMPLOYEE,
  ROLES.PICKER,
  ROLES.RIDER,
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_PARTNER,
]);

// The platform admin panel's roles (docs/21 §G). The super admin holds every
// admin permission implicitly; a partner holds only AdminPartner.permissions.
const PLATFORM_ADMIN_ROLES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.ADMIN_PARTNER]);

// Roles that may sign in through the CityCart Staff app (docs/20): the brand
// team member who keeps the order records and the picker. Brand owners stay on
// the web dashboard.
const STAFF_APP_ROLES = Object.freeze([ROLES.BRAND_EMPLOYEE, ROLES.PICKER]);

// Roles that may sign in through the CityCart Delivery app (docs/23): riders.
const DELIVERY_APP_ROLES = Object.freeze([ROLES.RIDER]);

module.exports = {
  ROLES,
  ALL_ROLES,
  BRAND_SCOPED_ROLES,
  STAFF_ROLES,
  STAFF_APP_ROLES,
  DELIVERY_APP_ROLES,
  PLATFORM_ADMIN_ROLES,
};