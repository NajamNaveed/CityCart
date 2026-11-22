const { z } = require('zod');

const Brand = require('../../../models/brand.model');
const ServiceProvider = require('../../../models/serviceProvider.model');
const SellerInvoice = require('../../../models/sellerInvoice.model');
const SellerPaymentClaim = require('../../../models/sellerPaymentClaim.model');
const BillingHelpRequest = require('../../../models/billingHelp.model');
const { getBillingSettings } = require('../../billing.service');
const { generate } = require('../index');
const { parseModelJson } = require('../guard');
const {
  TRIAGE_TYPES,
  URGENCIES,
  TYPE_LABELS,
  DRAFT_LIMIT,
  typeOf,
  buildTriageFacts,
  urgencyOf,
  strongestUrgency,
  draftOf,
  allowedAmountsOf,
  cleanDraft,
} = require('../triage.rules');
const { buildTriageMessages } = require('../prompts/adminTriage.prompt');

/**
 * Admin billing triage (docs/29 Phase 4b).
 *
 * The platform team reads one seller's billing question next to the records
 * that answer it: the seller's billing status, the invoices still owed, and the
 * payment claims waiting to be checked. Every figure comes from those rows.
 *
 * The model may name the question type and draft the reply, but it cannot
 * invent a figure, promise an approval or lower an urgency the records already
 * justify. Nothing is written: the administrator still edits the note and
 * presses the ordinary answer button, and the seller is notified only by that
 * action.
 */

const INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

class AdminTriageError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AdminTriageError';
    this.status = status;
    this.code = code;
  }
}

const modelSchema = z.object({
  type: z.enum(TRIAGE_TYPES),
  urgency: z.enum(URGENCIES),
  draft: z.string().trim().min(20).max(DRAFT_LIMIT),
});

async function adminTriage({ helpId, ctx }) {
  const help = await BillingHelpRequest.findById(helpId).lean();
  if (!help) throw new AdminTriageError(404, 'Request not found.', 'HELP_NOT_FOUND');

  const sellerType = help.sellerType === 'SERVICE_PROVIDER' ? 'SERVICE_PROVIDER' : 'BRAND';
  const Model = sellerType === 'BRAND' ? Brand : ServiceProvider;
  const seller = await Model.findById(help.sellerId)
    .select('name displayName billingStatus billingGraceUntil')
    .lean();
  if (!seller) throw new AdminTriageError(404, 'Seller not found.', 'SELLER_NOT_FOUND');

  const [invoices, claims, settings] = await Promise.all([
    SellerInvoice.find({
      sellerType,
      sellerId: help.sellerId,
      status: { $in: INVOICE_STATUSES },
      amountDuePaisa: { $gt: 0 },
    })
      .sort({ dueAt: 1 })
      .limit(6)
      .select('periodKey amountDuePaisa dueAt status')
      .lean(),
    SellerPaymentClaim.find({ sellerType, sellerId: help.sellerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('amountPaisa status method')
      .lean(),
    // Read-only: `getBillingSettings` never writes, unlike the seller summary
    // helper, which refreshes and stores the freeze ladder as a side effect.
    getBillingSettings(),
  ]);

  const facts = buildTriageFacts({
    seller: { ...seller, _id: help.sellerId, type: sellerType },
    invoices,
    claims,
    settings,
  });
  const rulesType = typeOf(help);
  const rulesUrgency = urgencyOf({ type: rulesType, facts });
  const allowedAmounts = allowedAmountsOf(facts);

  const answer = {
    help: {
      id: String(help._id),
      subject: help.subject,
      message: help.message,
      createdOn: help.createdAt || null,
    },
    facts,
  };

  try {
    const result = await generate({
      task: 'admin-triage',
      messages: buildTriageMessages({
        facts,
        subject: help.subject,
        message: help.message,
      }),
      json: true,
      temperature: 0.2,
      maxTokens: 500,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(result.text, modelSchema);
    const type = parsed.type;
    return {
      ...answer,
      classification: {
        type,
        label: TYPE_LABELS[type],
        urgency: strongestUrgency(rulesUrgency, parsed.urgency),
        source: 'model',
      },
      draft: cleanDraft(parsed.draft, draftOf({ type, facts }), allowedAmounts),
      degraded: false,
    };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      return {
        ...answer,
        classification: {
          type: rulesType,
          label: TYPE_LABELS[rulesType],
          urgency: rulesUrgency,
          source: 'rules',
        },
        draft: draftOf({ type: rulesType, facts }),
        degraded: true,
      };
    }
    throw err;
  }
}

module.exports = { adminTriage, AdminTriageError };
