/**
 * The bill explainer (docs/29 Phase 3d-6).
 *
 * CityCart has no payouts. A brand collects its own COD and owes the platform
 * 1% of completed sales, billed monthly (docs/15 §1, §2), so the money question
 * a brand admin actually asks is "why is this invoice this size?" — and every
 * number that answers it is already on a record: the invoice's five paisa
 * fields, the commission lines behind them, the orders those lines came from
 * and the payments submitted against the bill.
 *
 * This file therefore reads and groups. It adds stored fields together and
 * compares stored fields to each other; it never works out what a charge
 * *should* have been. Where two records disagree the answer says so instead of
 * picking a winner, because deciding that is the platform team's job and not an
 * AI panel's (docs/15 §20.8: report ambiguity about money, do not resolve it).
 *
 * Rupees and paisa never mix here: orders and customer payments are rupees
 * (docs/08 §6) while the commission ledger and the invoices are integer paisa
 * (docs/15 §13), so an order's amount is converted once, at the edge, and every
 * figure after that is an integer number of paisa.
 */

const { karachiDateKey } = require('../../utils/karachiTime');

// The rows the panel prints, and therefore the only rows the model may name.
const LINE_ROWS = 5;
const REVERSAL_ROWS = 3;

const DAY_MS = 86400000;

const SOURCE_LABELS = {
  ORDER: 'order',
  SERVICE_BOOKING: 'service booking',
};

const CLAIM_LABELS = {
  SUBMITTED: 'submitted, not checked yet',
  VERIFIED: 'verified by the platform team',
  REJECTED: 'rejected',
};

// Facts about what each status means, straight from docs/15 §7-§9. Only ISSUED,
// PARTIALLY_PAID, PAID and OVERDUE are reachable today; DRAFT and VOID are
// reserved in the enum, and an invoice that ever carries one is still described
// truthfully rather than guessed at.
const STATUS_COPY = {
  DRAFT: 'This bill has not been issued yet.',
  ISSUED: 'This bill is issued and waiting to be paid.',
  PARTIALLY_PAID: 'Part of this bill is paid: some of what you submitted was verified.',
  PAID: 'This bill is fully paid.',
  OVERDUE: 'This bill is past its due date.',
  VOID: 'This bill was voided. The figures below are the ones that were issued.',
};

const STATUS_ORDER = ['SUBMITTED', 'VERIFIED', 'REJECTED'];

function paisa(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

/** Order and payment amounts are rupees (docs/08 §6); the ledger is paisa. */
function rupeesToPaisa(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function groupDigits(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * One stored amount, in paisa and in the words the panel and the prompt both
 * print, so a shop never reads a number and a model never re-speaks it
 * differently. Integer division keeps PKR 1,234.56 exact.
 */
function amount(value) {
  const raw = paisa(value);
  const abs = Math.abs(raw);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return {
    paisa: raw,
    text: `${raw < 0 ? '−' : ''}PKR ${groupDigits(String(whole))}.${fraction}`,
  };
}

/** 100 bps -> "1%", 125 -> "1.25%", 50 -> "0.5%". No float arithmetic. */
function percent(bps) {
  const raw = paisa(bps);
  if (raw === 0) return '0%';
  const whole = Math.floor(Math.abs(raw) / 100);
  const fraction = Math.abs(raw) % 100;
  if (fraction === 0) return `${raw < 0 ? '-' : ''}${whole}%`;
  if (fraction % 10 === 0) return `${raw < 0 ? '-' : ''}${whole}.${fraction / 10}%`;
  return `${raw < 0 ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}%`;
}

function dayKey(date) {
  if (!date) return null;
  const time = Date.parse(date instanceof Date ? date : new Date(date));
  return Number.isFinite(time) ? karachiDateKey(new Date(time)) : null;
}

/** Whole days from `from` to `to`, negative when `to` comes first. */
function daySpan(from, to) {
  const start = Date.parse(from instanceof Date ? from.toISOString() : from);
  const end = Date.parse(to instanceof Date ? to.toISOString() : to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.floor((end - start) / DAY_MS);
}

function plural(count, word) {
  const value = paisa(count);
  return `${value} ${Math.abs(value) === 1 ? word : `${word}s`}`;
}

/** Verb agreement, so a printed count never reads as broken English to a shop. */
function agree(count, singular, pluralForm) {
  return Math.abs(paisa(count)) === 1 ? singular : pluralForm;
}

/** The distinct commission rates on a set of lines, and their wording. */
function ratesOf(entries) {
  const seen = [];
  for (const entry of entries) {
    const bps = paisa(entry.rateBps);
    if (!seen.includes(bps)) seen.push(bps);
  }
  seen.sort((a, b) => a - b);
  return {
    bps: seen,
    shared: seen.length === 1 ? seen[0] : null,
    text: seen.length === 1 ? percent(seen[0]) : `${seen.map((bps) => percent(bps)).join(' or ')}`,
    mixed: seen.length > 1,
  };
}

function sumPaisa(rows, field) {
  return rows.reduce((total, row) => total + paisa(row[field]), 0);
}

function invoiceView(invoice, now) {
  const dueAt = invoice.dueAt ? new Date(invoice.dueAt) : null;
  const pastDue = dueAt ? daySpan(dueAt, now) : null;
  const status = STATUS_COPY[invoice.status] ? invoice.status : null;
  return {
    id: String(invoice._id),
    periodKey: invoice.periodKey,
    period: { from: dayKey(invoice.periodStart), to: dayKey(invoice.periodEnd) },
    status,
    statusRaw: invoice.status,
    statusText: status ? STATUS_COPY[status] : 'CityCart has no description for this status, so nothing is claimed about it.',
    issuedOn: dayKey(invoice.issuedAt),
    dueOn: dayKey(dueAt),
    paidOn: dayKey(invoice.paidAt),
    createdOn: dayKey(invoice.createdAt),
    timing: {
      // The due date has passed, or has not. `null` when there is no due date
      // to measure against, which is never reported as "on time".
      overdue: pastDue === null ? null : pastDue > 0,
      daysPastDue: pastDue === null || pastDue <= 0 ? null : pastDue,
      daysUntilDue: pastDue === null || pastDue > 0 ? null : Math.abs(pastDue),
    },
    currency: invoice.currency || 'PKR',
  };
}

/** The five numbers on the invoice, in the order docs/15 §2 derives them. */
function moneyOf(invoice) {
  const commission = amount(invoice.commissionPaisa);
  const credits = amount(invoice.creditsPaisa);
  const paid = amount(invoice.paidPaisa);
  const due = amount(invoice.amountDuePaisa);
  return {
    sales: amount(invoice.salesPaisa),
    commission,
    credits,
    paid,
    due,
    billed: amount(paid.paisa + due.paisa),
  };
}

function orderMap(orders) {
  const map = new Map();
  for (const order of orders || []) {
    if (order && order._id) map.set(String(order._id), order);
  }
  return map;
}

/**
 * One order's own stored amounts beside the line that was charged on it. Three
 * stored figures are printed side by side and no equality is claimed between
 * them, because `recordOrderCommission` reads `netTotal` — and a door return
 * rewrites that field (return.service.js reduces it and can refund the fee
 * inside it). A line whose order came back part-collected is therefore supposed
 * to read smaller than `net − fee − tax`, and calling that a mismatch would
 * tell a shop its correct bill is broken. The fulfilment facts are printed
 * instead, so the reason shows itself without an accusation.
 */
const FULFILMENT_COPY = {
  FULL: 'Arrived complete.',
  PARTIAL: 'Part of it came back at the door.',
  NONE: 'None of it arrived.',
};

function orderFields(order) {
  if (!order) return null;
  const deliveryFee = amount(order.deliveryFeePaisa);
  const tax = amount(order.taxPaisa);
  return {
    net: amount(order.netPaisa),
    deliveryFee,
    tax,
    // The two amounts docs/15 §6.4 keeps out of the commission base.
    excluded: amount(deliveryFee.paisa + tax.paisa),
    returned: amount(order.returnedAmountPaisa),
    feeRefunded: Boolean(order.feeRefunded),
    fulfilment: FULFILMENT_COPY[order.fulfilment] ? order.fulfilment : null,
    fulfilmentText: FULFILMENT_COPY[order.fulfilment] || null,
  };
}

/** The two rankings the panel prints, shared so nothing can be shown twice. */
function byCommissionSize(a, b) {
  return paisa(b.commissionPaisa) - paisa(a.commissionPaisa);
}

function byReversalSize(a, b) {
  return Math.abs(paisa(b.commissionPaisa)) - Math.abs(paisa(a.commissionPaisa));
}

function lineOf(entry, ordersById) {
  const orderId = entry.sourceType === 'ORDER' && entry.sourceId ? String(entry.sourceId) : null;
  const order = orderId ? ordersById.get(orderId) : null;
  const fields = orderFields(order);
  return {
    entryId: String(entry._id),
    kind: entry.kind,
    sourceType: entry.sourceType,
    sourceLabel: SOURCE_LABELS[entry.sourceType] || 'record',
    orderId,
    orderNumber: order ? order.orderNumber || null : null,
    deliveredOn: order ? dayKey(order.deliveredAt || order.createdAt) : null,
    order: fields,
    eligible: amount(entry.eligibleAmountPaisa),
    rateBps: paisa(entry.rateBps),
    commission: amount(entry.commissionPaisa),
    occurredOn: dayKey(entry.occurredAt),
  };
}

function salesOf(salesEntries, ordersById) {
  const ordered = [...salesEntries].sort(byCommissionSize);
  const shown = ordered.slice(0, LINE_ROWS).map((entry) => lineOf(entry, ordersById));
  const rest = ordered.slice(LINE_ROWS);
  return {
    lines: shown,
    restCount: rest.length,
    restEligible: amount(sumPaisa(rest, 'eligibleAmountPaisa')),
    restCommission: amount(sumPaisa(rest, 'commissionPaisa')),
    count: salesEntries.length,
    eligible: amount(sumPaisa(salesEntries, 'eligibleAmountPaisa')),
    commission: amount(sumPaisa(salesEntries, 'commissionPaisa')),
    rates: ratesOf(salesEntries),
    // A line whose order was not found is stated, not counted as zero.
    missingOrders: shown.filter((line) => line.sourceType === 'ORDER' && !line.order).length,
  };
}

function creditsOf(reversalEntries, carriedClaims, ordersById) {
  const ordered = [...reversalEntries].sort(byReversalSize);
  const shown = ordered.slice(0, REVERSAL_ROWS).map((entry) => {
    const line = lineOf(entry, ordersById);
    return {
      ...line,
      reason: entry.reason || null,
      // A reversal's stored commission is negative. The panel and the prompt
      // both describe it as an amount coming *off*, so the sign is taken off
      // once here instead of left for each reader to trip over.
      offBill: amount(Math.abs(paisa(entry.commissionPaisa))),
    };
  });
  const rest = ordered.slice(REVERSAL_ROWS);
  return {
    lines: shown,
    restCount: rest.length,
    count: reversalEntries.length,
    reversed: amount(-sumPaisa(reversalEntries, 'commissionPaisa')),
    // Only the commission on a reversal is negative; the value it reversed is
    // stored as a positive amount (billing.service.js recordRefundReversal).
    eligible: amount(sumPaisa(reversalEntries, 'eligibleAmountPaisa')),
    carriedIn: {
      count: (carriedClaims || []).length,
      amount: amount(sumPaisa(carriedClaims || [], 'creditPaisa')),
    },
  };
}

function paymentsOf(claims) {
  const rows = claims || [];
  const byStatus = STATUS_ORDER.map((status) => {
    const group = rows.filter((claim) => claim.status === status);
    return {
      status,
      label: CLAIM_LABELS[status] || status,
      count: group.length,
      amount: amount(sumPaisa(group, 'amountPaisa')),
    };
  });
  return {
    count: rows.length,
    total: amount(sumPaisa(rows, 'amountPaisa')),
    byStatus,
    // What this invoice's own verified overpayments pushed into a later month.
    carriedOut: amount(sumPaisa(rows, 'creditPaisa')),
    // The rule, not a calculation: docs/15 §8 — nothing is credited until the
    // platform team verifies it.
    note:
      rows.length === 0
        ? 'No payment has been submitted against this invoice.'
        : 'A submitted payment only reduces what you owe after the platform team verifies it.',
  };
}

function checkOf(key, label, ok, detail) {
  return { key, label, ok, detail };
}

/**
 * Four identities between stored fields. Each one either holds, fails, or is
 * `null` because there is nothing to hold it up — a `null` is never written as
 * a pass.
 */
function checksOf(invoice, money, sales, credits) {
  const salesEntries = sales.count;
  const addsUp =
    paisa(invoice.commissionPaisa) ===
    paisa(invoice.creditsPaisa) + paisa(invoice.paidPaisa) + paisa(invoice.amountDuePaisa);

  const salesMatch =
    salesEntries === 0
      ? null
      : paisa(invoice.salesPaisa) === sales.eligible.paisa;
  const commissionMatch =
    salesEntries === 0
      ? null
      : paisa(invoice.commissionPaisa) === sales.commission.paisa;
  const creditsMatch =
    credits.count === 0 && credits.carriedIn.count === 0
      ? paisa(invoice.creditsPaisa) === 0
      : paisa(invoice.creditsPaisa) === credits.reversed.paisa + credits.carriedIn.amount.paisa;

  return [
    checkOf(
      'adds-up',
      'The bill adds up',
      addsUp,
      addsUp
        ? `${money.commission.text} commission equals ${money.credits.text} credits plus ${money.paid.text} paid plus ${money.due.text} due.`
        : `${money.commission.text} commission does not equal ${money.credits.text} credits plus ${money.paid.text} paid plus ${money.due.text} due.`
    ),
    checkOf(
      'sales',
      'The sales behind the bill',
      salesMatch,
      salesMatch === null
        ? 'No sale lines are attached to this invoice, so there is nothing to add up.'
        : salesMatch
          ? `The ${plural(salesEntries, 'sale line')} attached to it ${agree(
              salesEntries,
              'adds',
              'add',
            )} up to ${sales.eligible.text}, which is what the invoice says.`
          : `The ${plural(salesEntries, 'sale line')} attached to it ${agree(
              salesEntries,
              'adds',
              'add',
            )} up to ${sales.eligible.text}, but the invoice says ${money.sales.text}.`
    ),
    checkOf(
      'commission',
      'The commission on those lines',
      commissionMatch,
      commissionMatch === null
        ? 'No sale lines are attached to this invoice, so there is nothing to compare.'
        : commissionMatch
          ? `The ${plural(salesEntries, 'sale line')} ${agree(salesEntries, 'carries', 'carry')} ${
              sales.commission.text
            } in total, which is what the invoice charges.`
          : `The ${plural(salesEntries, 'sale line')} ${agree(salesEntries, 'carries', 'carry')} ${
              sales.commission.text
            } in total, but the invoice charges ${money.commission.text}.`
    ),
    checkOf(
      'credits',
      'What was taken off',
      creditsMatch,
      creditsMatch
        ? `${credits.reversed.text} from ${plural(credits.count, 'refund reversal')} and ${credits.carriedIn.amount.text} carried in from an earlier overpayment add up to the ${money.credits.text} taken off.`
        : `${credits.reversed.text} from ${plural(credits.count, 'refund reversal')} and ${credits.carriedIn.amount.text} carried in do not add up to the ${money.credits.text} the invoice takes off.`
    ),
  ];
}

/**
 * The commission lines the panel prints, chosen with the same sorts `salesOf`
 * and `creditsOf` use. The agent reads order records for exactly these lines,
 * so a month that sold thousands of items costs one bounded query, and the
 * figures handed to the model are always the figures the shop is shown.
 */
function printableEntries(entries = []) {
  const rows = entries || [];
  const sales = [...rows.filter((entry) => entry.kind === 'SALE')].sort(byCommissionSize).slice(0, LINE_ROWS);
  const reversals = [...rows.filter((entry) => entry.kind === 'REVERSAL')]
    .sort(byReversalSize)
    .slice(0, REVERSAL_ROWS);
  const orderIds = [];
  for (const entry of [...sales, ...reversals]) {
    if (entry.sourceType === 'ORDER' && entry.sourceId) {
      const id = String(entry.sourceId);
      if (!orderIds.includes(id)) orderIds.push(id);
    }
  }
  return { sales, reversals, all: [...sales, ...reversals], orderIds };
}

function buildBillingExplain({ invoice, entries = [], claims = [], carriedClaims = [], orders = [], now = new Date() }) {
  if (!invoice || !invoice._id) {
    throw new Error('buildBillingExplain needs an invoice.');
  }
  const rows = entries || [];
  const salesEntries = rows.filter((entry) => entry.kind === 'SALE');
  const reversalEntries = rows.filter((entry) => entry.kind === 'REVERSAL');
  const otherEntries = rows.filter((entry) => entry.kind !== 'SALE' && entry.kind !== 'REVERSAL');
  const byId = orderMap(orders);

  const money = moneyOf(invoice);
  const sales = salesOf(salesEntries, byId);
  const credits = creditsOf(reversalEntries, carriedClaims, byId);
  const checks = checksOf(invoice, money, sales, credits);

  return {
    invoice: invoiceView(invoice, now),
    money,
    sales,
    credits,
    payments: paymentsOf(claims),
    rate: sales.rates,
    // Entries that are neither a sale nor a reversal are counted, never read
    // into: the enum has two kinds today, so anything else is data the panel
    // has no honest sentence for.
    unkindedLines: otherEntries.length,
    checks,
    allChecksPass: checks.every((check) => check.ok === true),
    // `allChecksPass` is false for an invoice with nothing to compare, which is
    // not the same as a month whose records disagree. Only a `false` verdict may
    // send a shop to the Help tab; a `null` must never do it.
    anyCheckFailed: checks.some((check) => check.ok === false),
    // An invoice with no commission lines has nothing but its own five numbers,
    // and there is no story to tell from them.
    empty: rows.length === 0,
    currency: invoice.currency || 'PKR',
  };
}

module.exports = {
  buildBillingExplain,
  printableEntries,
  orderMap,
  amount,
  percent,
  rupeesToPaisa,
  dayKey,
  daySpan,
  ratesOf,
  invoiceView,
  moneyOf,
  salesOf,
  creditsOf,
  paymentsOf,
  checksOf,
  lineOf,
  plural,
  agree,
  STATUS_COPY,
  FULFILMENT_COPY,
  CLAIM_LABELS,
  SOURCE_LABELS,
  LINE_ROWS,
  REVERSAL_ROWS,
  DAY_MS,
};
