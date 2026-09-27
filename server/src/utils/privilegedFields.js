/**
 * Privileged-field protection, per
 * docs/02-user-roles-and-permissions.md §28 (Security Principles —
 * "Never allow users to elevate their own privileges") and §19 (Role
 * Assignment Rules — employees/customers cannot change their own role).
 *
 * No endpoint in this codebase yet accepts a general User/Employee
 * update payload (there is no profile-update or employee-update route
 * yet — both are later-phase scope). This utility exists so that when
 * those endpoints are built, they have a single, already-tested place
 * to strip these fields from client input, rather than each future
 * controller reimplementing its own allow/block-list and risking one
 * that forgets a field. The existing register endpoint already only
 * accepts an explicit allow-list (name/email/password) via its Zod
 * schema, which achieves the same outcome for that one route.
 */
const PRIVILEGED_USER_FIELDS = Object.freeze(['role', 'brandId', 'permissions', 'isActive']);

/**
 * Returns a shallow copy of `input` with every key in
 * PRIVILEGED_USER_FIELDS (plus any caller-supplied extraFields) removed.
 * Never mutates the original object.
 */
function stripPrivilegedFields(input, extraFields = []) {
  const blocked = new Set([...PRIVILEGED_USER_FIELDS, ...extraFields]);
  return Object.fromEntries(Object.entries(input || {}).filter(([key]) => !blocked.has(key)));
}

module.exports = { PRIVILEGED_USER_FIELDS, stripPrivilegedFields };