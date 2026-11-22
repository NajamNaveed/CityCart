const { sanitizeUserText } = require('./guard');
const { amount, percent, daySpan, dayKey, plural } = require('./billingExplain.rules');

/**
 * Admin billing triage arithmetic (docs/29 Phase 4b).
 *
 * The platform team answers sellers' billing questions from the Help tab. This
 * module turns one `BillingHelpRequest` plus the seller's stored billing record
 * into facts the administrator and the model both read: what is owed, how old
 * it is, which claims are waiting, and the platform terms that apply.
 *
 * Classification is first a rules decision from the seller's own words, and the
 * model may only refine it inside the same fixed lists. Urgency is combined so
 * the model can raise a case but never quieten one: a frozen or overdue seller
 * stays HIGH even if the model says LOW.
 */

const TRIAGE_TYPES = [
  'PAYMENT_CLAIM',
  'INVOICE_AMOUNT',
  'INVOICE_COPY',
  'ACCOUNT_STATUS',
  'GRACE_REQUEST',
  'OTHER',
];

const TYPE_LABELS = {
  PAYMENT_CLAIM: 'Payment claim',
  INVOICE_AMOUNT: 'Bill amount',
  INVOICE_COPY: 'Invoice copy',
  ACCOUNT_STATUS: 'Account status',
  GRACE_REQUEST: 'More time to pay',
  OTHER: 'Other',
};

const URGENCIES = ['LOW', 'NORMAL', 'HIGH'];
const URGENCY_RANK = { LOW: 0, NORMAL: 1, HIGH: 2 };

const DRAFT_LIMIT = 900;
const LINK_PATTERN = /(?:https?:\/\/|www\.)/i;
const MONEY_TOKEN = /PKR\s?[−-]?\d[\d,]*\.\d{2}/g;
// Only the promise forms are refused: a draft may still explain that a refund
// was reversed without claiming to have granted anything.
const PROMISE_PATTERN =
  /(we (?:will|have)?\s*(?:refund|waive|approve|credit|extend)|has been (?:refunded|waived|approved|extended)|extension is approved|guaranteed)/i;

const TYPE_PATTERNS = [
  ['ACCOUNT_STATUS', /(freeze|frozen|block|blocked|restrict|restricted|suspend|suspended|cannot sell|can't sell|band kar|stop selling)/i],
  ['PAYMENT_CLAIM', /(payment|paid|pay|deposit|transfer|slip|proof|screenshot|claim|reference|raqam|paisa bhej)/i],
  ['GRACE_REQUEST', /(grace|more time|extension|installment|qist|extra days|few days|delay)/i],
  ['INVOICE_AMOUNT', /(wrong|incorrect|overcharg|extra|double|charged|charge|commission|why.*(bill|invoice|amount)|balance)/i],
  ['INVOICE_COPY', /(copy|pdf|download|document|attach|share.*invoice|invoice.*(receipt|copy))/i],
];

function sentenceText(value, limit = 2000) {
  return sanitizeUserText(value || '', limit).replace(/\s+/g, ' ').trim();
}

function rank(value) {
  return Object.prototype.hasOwnProperty.call(URGENCY_RANK, value) ? URGENCY_RANK[value] : -1;
}

function typeOf(help) {
  const words = `${help && help.subject ? help.subject : ''} ${help && help.message ? help.message : ''}`;
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(words)) return type;
  }
  return 'OTHER';
}

function statusSentence(status) {
  switch (status) {
    case 'WARNING':
      return 'The account is on a billing warning; selling continues while the balance is paid.';
    case 'RESTRICTED':
      return 'Selling is limited until the balance is paid; orders already placed can still be completed.';
    case 'FROZEN':
      return 'Selling is paused until the balance is paid.';
    case 'ACTIVE':
      return 'The account has no billing restriction on it right now.';
    default:
      return 'The account has a billing status CityCart has no description for, so nothing is claimed about it.';
  }
}

/**
 * The seller's stored billing facts. Invoices must already be the seller's
 * outstanding ones, oldest first, and claims that seller's latest ones.
 */
function buildTriageFacts({ seller, invoices = [], claims = [], settings, now = new Date() }) {
  const balancePaisa = invoices.reduce(
    (sum, invoice) => sum + Math.trunc(Number(invoice.amountDuePaisa) || 0),
    0
  );
  const oldest = invoices[0] || null;
  const dueAt = oldest && oldest.dueAt ? new Date(oldest.dueAt) : null;
  const pastDue = dueAt ? daySpan(dueAt, now) : null;
  const pendingClaims = claims.filter((claim) => claim.status === 'SUBMITTED').length;

  return {
    seller: {
      type: seller.type,
      name: sentenceText(seller.name || seller.displayName || 'Seller', 120) || 'Seller',
      billingStatus: seller.billingStatus || 'ACTIVE',
      graceUntil: seller.billingGraceUntil ? dayKey(seller.billingGraceUntil) : null,
    },
    balance: amount(balancePaisa),
    unpaidInvoices: invoices.length,
    oldestDueOn: dueAt ? dayKey(dueAt) : null,
    daysOverdue: pastDue === null ? null : Math.max(0, pastDue),
    pendingClaims,
    recentClaims: claims.slice(0, 5).map((claim) => ({
      amount: amount(claim.amountPaisa),
      status: claim.status || 'UNKNOWN',
      method: claim.method || null,
    })),
    invoices: invoices.slice(0, 6).map((invoice) => ({
      periodKey: invoice.periodKey || null,
      amount: amount(invoice.amountDuePaisa),
      dueOn: invoice.dueAt ? dayKey(invoice.dueAt) : null,
      status: invoice.status || null,
    })),
    terms: {
      commissionText: percent(settings.rateBps),
      rateBps: settings.rateBps,
      dueDays: settings.dueDays,
      restrictAfterDays: settings.restrictAfterDays,
      freezeAfterDays: settings.freezeAfterDays,
    },
    // The account number and IBAN are deliberately absent: a draft is not the
    // place to print them, and the administrator adds them if they want to.
    bankReady: Boolean(settings.bank && settings.bank.bankName && settings.bank.accountNumber),
  };
}

function urgencyOf({ type, facts }) {
  if (type === 'ACCOUNT_STATUS') return 'HIGH';
  if (facts.seller.billingStatus === 'FROZEN' || facts.seller.billingStatus === 'RESTRICTED') return 'HIGH';
  if (facts.daysOverdue !== null && facts.daysOverdue > facts.terms.restrictAfterDays) return 'HIGH';
  if (type === 'INVOICE_COPY') return 'LOW';
  if (type === 'OTHER' && facts.balance.paisa === 0) return 'LOW';
  return 'NORMAL';
}

/** The model may raise urgency; it can never lower what the records show. */
function strongestUrgency(rulesUrgency, modelUrgency) {
  return rank(modelUrgency) > rank(rulesUrgency) ? modelUrgency : rulesUrgency;
}

function dueLineOf(facts) {
  if (facts.unpaidInvoices === 0) return 'Nothing is outstanding on this account right now.';
  const invoices = plural(facts.unpaidInvoices, 'unpaid invoice');
  const oldest = facts.oldestDueOn ? `, with the oldest due on ${facts.oldestDueOn}` : '';
  return `The account has ${facts.balance.text} outstanding across ${invoices}${oldest}.`;
}

/**
 * A complete, honest reply built only from stored facts. Used whenever the
 * model is unavailable or writes something this module refuses.
 */
function draftOf({ type, facts }) {
  const due = dueLineOf(facts);
  switch (type) {
    case 'PAYMENT_CLAIM':
      return [
        facts.pendingClaims
          ? `${plural(facts.pendingClaims, 'payment claim')} from you ${
              facts.pendingClaims === 1 ? 'is' : 'are'
            } waiting to be checked; when one is verified the credit appears on your billing page and lowers the balance, with nothing else needed from you today.`
          : 'No payment claim from you is waiting to be checked. If you have already transferred the money, submit the reference from the billing page so the team can match it.',
        due,
        `The commission is ${facts.terms.commissionText} of each sale and invoices are due ${facts.terms.dueDays} days after they are issued.`,
      ].join(' ');
    case 'INVOICE_AMOUNT':
      return `Every amount on an invoice comes from one order's own sale, refund or reversal, and each line names the order it came from. ${due} The commission is ${facts.terms.commissionText} of each sale and invoices are due ${facts.terms.dueDays} days after issue; open the invoice on the billing page to see its lines.`;
    case 'INVOICE_COPY':
      return `You can open and download each invoice from the billing page; the document belongs to the invoice itself. ${due}`;
    case 'ACCOUNT_STATUS':
      return [statusSentence(facts.seller.billingStatus), due, facts.unpaidInvoices ? 'Paying the balance restores the account to normal.' : '']
        .filter(Boolean)
        .join(' ');
    case 'GRACE_REQUEST':
      return `Requests for more time are reviewed one by one and are not an automatic extension. ${due} If the team agrees, the grace date is set on your billing page and you will see it there.`;
    default:
      return `Thank you for writing in. ${due} Reply with the invoice number or payment reference you mean, and the team will look at that record.`;
  }
}

function allowedAmountsOf(facts) {
  const texts = [facts.balance.text];
  for (const claim of facts.recentClaims) texts.push(claim.amount.text);
  for (const invoice of facts.invoices) texts.push(invoice.amount.text);
  return texts;
}

/**
 * A draft may use only amounts CityCart printed, and may not link out or claim
 * an approval. Anything else gets the rules draft, so the administrator never
 * reads a promise or a figure that is not on the records.
 */
function cleanDraft(value, fallback, allowedAmounts) {
  const text = sentenceText(value, DRAFT_LIMIT);
  if (text.length < 20) return fallback;
  if (LINK_PATTERN.test(text) || PROMISE_PATTERN.test(text)) return fallback;
  const allowed = new Set(allowedAmounts || []);
  const used = text.match(MONEY_TOKEN) || [];
  if (used.some((token) => !allowed.has(token))) return fallback;
  return text;
}

module.exports = {
  TRIAGE_TYPES,
  TYPE_LABELS,
  URGENCIES,
  URGENCY_RANK,
  DRAFT_LIMIT,
  typeOf,
  statusSentence,
  buildTriageFacts,
  urgencyOf,
  strongestUrgency,
  draftOf,
  allowedAmountsOf,
  cleanDraft,
};
