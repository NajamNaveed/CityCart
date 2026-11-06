/**
 * Service-booking lifecycle (docs/24 §4.4).
 *
 * REQUESTED  the customer asked for a slot
 * PROPOSED   the provider answered with a price/scope/slot proposal
 * ACCEPTED   price and slot are agreed; the job is on the calendar
 * IN_PROGRESS the provider started the job
 * COMPLETED  the provider finished and stated the final amount
 * CONFIRMED  the customer (or the 3-day auto-confirm) accepted completion
 * DECLINED   the customer refused the provider's proposal
 * CANCELLED  either side cancelled; the cancellation snapshot says who/when/late
 * DISPUTED   the customer disputes the completion; it waits for a super admin
 */
const SERVICE_BOOKING_STATUSES = [
  'REQUESTED',
  'PROPOSED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'DISPUTED',
];

const BOOKING_STATUS_TRANSITIONS = Object.freeze({
  REQUESTED: ['PROPOSED', 'ACCEPTED', 'DECLINED', 'CANCELLED'],
  PROPOSED: ['ACCEPTED', 'DECLINED', 'REQUESTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['CONFIRMED', 'DISPUTED'],
  DISPUTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: [],
  DECLINED: [],
  CANCELLED: [],
});

// Statuses in which a job is still expected to happen (or did happen) and the
// customer/provider may still talk inside the booking chat.
const CHAT_OPEN_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED', 'DISPUTED', 'CANCELLED'];

// Statuses that occupy the provider's calendar; a new acceptance may not
// overlap one of these.
const SLOT_HOLDING_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED', 'DISPUTED'];

const AUTO_CONFIRM_DAYS = 3;
const PROPOSAL_EXPIRY_HOURS = 24;
const MAX_PROPOSAL_EXPIRY_HOURS = 72;
const MAX_ADVANCE_DAYS = 60;

module.exports = {
  SERVICE_BOOKING_STATUSES,
  BOOKING_STATUS_TRANSITIONS,
  CHAT_OPEN_STATUSES,
  SLOT_HOLDING_STATUSES,
  AUTO_CONFIRM_DAYS,
  PROPOSAL_EXPIRY_HOURS,
  MAX_PROPOSAL_EXPIRY_HOURS,
  MAX_ADVANCE_DAYS,
};
