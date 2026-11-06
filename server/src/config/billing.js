/**
 * Seller billing values (docs/15, docs/24 §5).
 *
 * A seller is a brand or a service provider. CityCart charges 1% of completed
 * sales; the customer pays the seller directly and never pays the platform.
 * All amounts are integer paisa.
 */
const BILLING_STATUSES = ['ACTIVE', 'WARNING', 'RESTRICTED', 'FROZEN'];

const SELLER_TYPES = ['BRAND', 'SERVICE_PROVIDER'];

const COMMISSION_SOURCE_TYPES = ['ORDER', 'SERVICE_BOOKING'];

const COMMISSION_KINDS = ['SALE', 'REVERSAL'];

const COMMISSION_STATUSES = ['ACCRUED', 'INVOICED', 'PAID', 'REVERSED'];

const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'];

const CLAIM_STATUSES = ['SUBMITTED', 'VERIFIED', 'REJECTED'];

const CLAIM_METHODS = ['BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'OTHER'];

const HELP_STATUSES = ['OPEN', 'RESOLVED'];

const BILLING_DEFAULTS = Object.freeze({
  rateBps: 100,
  dueDays: 7,
  restrictAfterDays: 7,
  freezeAfterDays: 14,
  minimumInvoicePaisa: 10000,
});

// A seller may always sell while ACTIVE or WARNING; from RESTRICTED no new
// order or booking may be created (docs/15 §9).
const SELLING_BLOCKED_STATUSES = ['RESTRICTED', 'FROZEN'];

module.exports = {
  BILLING_STATUSES,
  SELLER_TYPES,
  COMMISSION_SOURCE_TYPES,
  COMMISSION_KINDS,
  COMMISSION_STATUSES,
  INVOICE_STATUSES,
  CLAIM_STATUSES,
  CLAIM_METHODS,
  HELP_STATUSES,
  BILLING_DEFAULTS,
  SELLING_BLOCKED_STATUSES,
};
