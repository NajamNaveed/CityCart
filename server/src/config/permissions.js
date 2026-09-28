/**
 * Centralized employee permission constants, per
 * docs/02-user-roles-and-permissions.md §5 (Permission Naming
 * Convention — "resource.action") and §6 (Permission Groups).
 *
 * This covers the permission groups relevant to this phase's scope
 * (Products, Orders, Inventory, Customers, Employees). doc02 §6 also
 * defines Reviews, Analytics, Notifications, Delivery, and Payments
 * permission groups; those are left out here because their underlying
 * business modules are out of scope until later phases build them —
 * add to this same file when that happens, rather than creating a
 * second permissions module.
 *
 * DOCUMENTATION CONFLICT (flagged, not silently resolved): STORE_UPDATE
 * was added during Phase 6. docs/05-api-specification.md §10 (Store
 * Endpoints -> Update Store) explicitly states this endpoint's
 * authorization "requires: store.update + correct brand ownership,"
 * but docs/02-user-roles-and-permissions.md §6 (Permission Groups) has
 * no Store permission group at all — Products, Orders, Inventory,
 * Customers, Employees, Reviews, Analytics, Notifications, Delivery,
 * and Payments are the only groups defined there. Since doc02 §24
 * documents the permission system as explicitly extensible, and doc05
 * names this exact permission string, adding it here (rather than
 * inventing a different mechanism, or leaving Store Update
 * unenforceable for BRAND_EMPLOYEE) is the smallest change consistent
 * with both documents. This should be confirmed by a human and, ideally,
 * doc02 §6 updated to include it.
 */
const PERMISSIONS = Object.freeze({
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',

  // Added in Phase 7 — already documented in docs/02 §6.2 (Category
  // Permissions), just not centralized here until a Category route
  // needed them.
  CATEGORIES_VIEW: 'categories.view',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_UPDATE: 'categories.update',
  CATEGORIES_DELETE: 'categories.delete',

  ORDERS_VIEW: 'orders.view',
  ORDERS_MANAGE: 'orders.manage',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',

  CUSTOMERS_VIEW: 'customers.view',

  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_UPDATE: 'employees.update',
  EMPLOYEES_DELETE: 'employees.delete',
  EMPLOYEES_MANAGE_PERMISSIONS: 'employees.manage_permissions',

  STORE_UPDATE: 'store.update',
});

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

module.exports = { PERMISSIONS, ALL_PERMISSIONS };