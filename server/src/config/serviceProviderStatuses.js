/**
 * Lifecycle values for a service-provider tenant (docs/24 §4.1).
 *
 * PENDING    application created; not publicly listed
 * ACTIVE     approved by the super admin; discoverable in its one block
 * SUSPENDED  temporarily hidden (also used to refuse an application)
 * TERMINATED permanent removal; the row and its history stay
 */
const PROVIDER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'];
const PROVIDER_VERIFICATIONS = ['UNVERIFIED', 'VERIFIED', 'REJECTED'];
const BILLING_STATUSES = ['ACTIVE', 'WARNING', 'RESTRICTED', 'FROZEN'];

// Allowed admin moves. TERMINATED is final; a pending application is either
// approved (ACTIVE) or refused (SUSPENDED).
const PROVIDER_STATUS_TRANSITIONS = {
  PENDING: ['ACTIVE', 'SUSPENDED'],
  ACTIVE: ['SUSPENDED', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],
  TERMINATED: [],
};

module.exports = {
  PROVIDER_STATUSES,
  PROVIDER_VERIFICATIONS,
  BILLING_STATUSES,
  PROVIDER_STATUS_TRANSITIONS,
};
