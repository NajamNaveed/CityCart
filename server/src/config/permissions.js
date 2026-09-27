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
 */
const PERMISSIONS = Object.freeze({
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',

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
});

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

module.exports = { PERMISSIONS, ALL_PERMISSIONS };