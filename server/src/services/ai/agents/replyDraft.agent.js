const mongoose = require('mongoose');
const { z } = require('zod');

const Brand = require('../../../models/brand.model');
const Conversation = require('../../../models/conversation.model');
const Message = require('../../../models/message.model');
const Product = require('../../../models/product.model');
const Review = require('../../../models/review.model');
const User = require('../../../models/user.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { languageOf } = require('../facts');
const { readChatFacts } = require('../brandChatFacts');
const { checkDraft, serverDraft, DECLINED_LINES } = require('../draftGuard');
const {
  buildReplyDraftMessages,
  REPLY_LIMIT,
  HISTORY_MESSAGES,
  NAME_LIMIT,
  TITLE_LIMIT,
  COMMENT_LIMIT,
  MESSAGE_LIMIT,
} = require('../prompts/replyDraft.prompt');

/**
 * Brand-side reply drafting (docs/29 Phase 3c, read-and-verify since Phase 2i).
 * A shop asks for the words to answer one of its own reviews or one of its own
 * customer chats and gets a draft back — nothing more. The chat draft goes into
 * the composer and the ordinary send endpoint re-checks membership, permissions
 * and whether the seller is open; a review draft has no publish path of its own
 * because the reply is posted through the review endpoint.
 *
 * Both halves read by id inside the caller's own tenant, and a row that is not
 * this shop's answers 404 — the same anti-probing answer the chat services give.
 *
 * A chat draft is no longer written from the message alone. The server first
 * works out which question the customer is asking, reads only the records that
 * answer it (`brandChatFacts.js`), and then either writes the reply itself or
 * lets the model word those records and checks the finished sentence against
 * them (`draftGuard.js`). So what reaches the provider is names, the customer's
 * own text and one small block of this shop's true data — never its whole
 * database, never another shop's row, and never the exact stock quantity, which
 * CityCart shows to the shop alone.
 */
const TYPES = ['review', 'chat'];
const CUSTOMER_SIDE = 'CUSTOMER';
const FACT_LIMIT = 120;

class ReplyDraftError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const modelSchema = z.object({
  draft: z.string().trim().min(1).max(REPLY_LIMIT),
});

/** One line of a prompt: markup out, newlines flattened, length bounded. */
function text(value, limit) {
  return sanitizeUserText(value || '', limit).replace(/\s+/g, ' ').trim();
}

/** First name only — enough to greet a person, not enough to expose an identity. */
function greeting(value) {
  return text(value, NAME_LIMIT).split(' ')[0] || 'Customer';
}

/**
 * Records are read from the shop's own rows, and a listing name is text someone
 * typed. Numbers and booleans pass through — the guard has to see the same
 * figures the prompt was given — but every string is flattened and bounded so a
 * product name cannot carry instructions into a provider call.
 */
function sanitizeFacts(facts) {
  const out = {};
  for (const [key, value] of Object.entries(facts || {})) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const items = [];
      for (const item of value) {
        if (item && typeof item === 'object') {
          const clean = sanitizeFacts(item);
          // A pair left holding only half of itself is not a record: the prompt
          // would print a name with nothing after it.
          if (Object.keys(clean).length === Object.keys(item).length) items.push(clean);
          continue;
        }
        const clean = text(item, FACT_LIMIT);
        if (clean) items.push(clean);
      }
      if (items.length) out[key] = items;
      continue;
    }
    if (value && typeof value === 'object') {
      const nested = sanitizeFacts(value);
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }
    const clean = text(value, FACT_LIMIT);
    if (clean) out[key] = clean;
  }
  return out;
}

/** The two names the reply needs, read by id and never from the request body. */
async function people(brandId, personId) {
  const [brand, person] = await Promise.all([
    Brand.findById(brandId).select('name').lean(),
    personId ? User.findById(personId).select('name').lean() : null,
  ]);
  return { brandName: text(brand ? brand.name : '', NAME_LIMIT) || 'the shop', personName: greeting(person ? person.name : '') };
}

/** A listing of this shop's own product, by id and tenant — never another shop's. */
async function productNameOf(productId, brandId) {
  if (!productId) return null;
  const product = await Product.findOne({ _id: productId, brandId }).select('name').lean();
  return product ? text(product.name, NAME_LIMIT) || null : null;
}

async function reviewSubject(id, brandId) {
  // Approved only, because that is exactly the set the shop's own review list
  // shows; a hidden review answers with the same 404 as one that is not its own.
  const review = await Review.findOne({ _id: id, brandId, isApproved: true }).lean();
  if (!review) throw new ReplyDraftError(404, 'Review not found.');

  const [names, productName] = await Promise.all([
    people(brandId, review.customerId),
    productNameOf(review.productId, brandId),
  ]);

  return {
    type: 'review',
    brandName: names.brandName,
    reviewerName: names.personName,
    productName,
    rating: review.rating,
    title: text(review.title, TITLE_LIMIT),
    comment: text(review.comment, COMMENT_LIMIT),
  };
}

async function chatSubject(id, brandId) {
  const conversation = await Conversation.findOne({ _id: id, brandId }).lean();
  if (!conversation) throw new ReplyDraftError(404, 'Conversation not found.');

  const rows = await Message.find({ conversationId: conversation._id })
    .sort({ _id: -1 })
    .limit(HISTORY_MESSAGES)
    .lean();

  const latest = rows.find((row) => row.senderRole === CUSTOMER_SIDE);
  if (!latest) {
    throw new ReplyDraftError(409, 'There is no customer message to answer yet.', 'NOTHING_TO_ANSWER');
  }

  const [names, productName] = await Promise.all([
    people(brandId, conversation.customerId),
    productNameOf(latest.productId, brandId),
  ]);

  return {
    type: 'chat',
    brandName: names.brandName,
    customerName: names.personName,
    productName,
    history: rows
      .slice()
      .reverse()
      .map((row) => ({
        from: row.senderRole === CUSTOMER_SIDE ? 'Customer' : 'Shop',
        text: text(row.body, MESSAGE_LIMIT),
      }))
      .filter((row) => row.text),
    latest: text(latest.body, MESSAGE_LIMIT),
    // Both ids come out of this shop's own rows — the conversation's customer
    // and the listing the message was sent from — and are what every later read
    // is keyed by. The provider is never shown either one.
    customerId: conversation.customerId || null,
    productId: latest.productId || null,
  };
}

/** One provider call: the shop's words for the records the server read. */
async function wordsDraft(subject, facts, ctx) {
  const result = await generate({
    task: 'reply-draft',
    messages: buildReplyDraftMessages(subject, facts),
    json: true,
    temperature: 0.4,
    maxTokens: 500,
    userId: ctx.userId,
    role: ctx.role,
  });
  return parseModelJson(result.text, modelSchema).draft;
}

async function reviewDraft(rowId, tenantId, ctx) {
  const subject = await reviewSubject(rowId, tenantId);
  const facts = sanitizeFacts({
    ...(subject.rating ? { rating: subject.rating } : {}),
    ...(subject.productName ? { productName: subject.productName } : {}),
  });
  const language = languageOf([subject.title, subject.comment].filter(Boolean).join(' '));
  const words = await wordsDraft(subject, facts, ctx);
  const verdict = checkDraft({ draft: words, facts });

  return {
    type: 'review',
    family: 'review',
    source: 'model',
    draft: verdict.ok ? words : serverDraft({ family: 'review', facts, language }),
    grounded: verdict.ok,
    corrected: !verdict.ok,
    ...(verdict.ok ? {} : { reasons: verdict.reasons }),
    declined: null,
  };
}

async function chatDraft(rowId, tenantId, ctx) {
  const subject = await chatSubject(rowId, tenantId);
  const read = await readChatFacts({
    brandId: tenantId,
    customerId: subject.customerId,
    productId: subject.productId,
    message: subject.latest,
  });
  const facts = sanitizeFacts(read.facts);
  const base = {
    type: 'chat',
    family: read.family,
    language: read.language,
    declined: read.declined || null,
    ...(read.private && Object.keys(read.private).length ? { private: read.private } : {}),
  };

  // Nothing to state: the shop is told which screen holds the missing data
  // instead of being handed a plausible reply about things CityCart never read.
  if (read.declined) {
    return {
      ...base,
      source: 'none',
      draft: null,
      note: DECLINED_LINES[read.declined] || 'CityCart has no record that answers this question.',
    };
  }

  // A platform rule, a listing the customer did not name, an order that does not
  // exist — the server already has the whole answer, so no provider is called.
  if (read.source === 'server') {
    return {
      ...base,
      source: 'server',
      draft: serverDraft({ family: read.family, facts, language: read.language }),
      grounded: true,
      corrected: false,
    };
  }

  const words = await wordsDraft(subject, facts, ctx);
  const verdict = checkDraft({ draft: words, facts });
  if (verdict.ok) return { ...base, source: 'model', draft: words, grounded: true, corrected: false };

  return {
    ...base,
    source: 'model',
    draft: serverDraft({ family: read.family, facts, language: read.language }),
    grounded: false,
    corrected: true,
    reasons: verdict.reasons,
  };
}

async function draftReply({ type, id, ctx }) {
  if (!TYPES.includes(type)) {
    throw new ReplyDraftError(400, 'Choose what to reply to.');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ReplyDraftError(404, type === 'review' ? 'Review not found.' : 'Conversation not found.');
  }
  if (!ctx.brandId) {
    throw new ReplyDraftError(403, 'This needs a brand account.', 'NO_BRAND');
  }

  // Both ids become ObjectIds here: the tenant the session resolved is the
  // only brand this agent can ever ask about, whatever the body said.
  const rowId = new mongoose.Types.ObjectId(String(id));
  const tenantId = new mongoose.Types.ObjectId(String(ctx.brandId));

  return type === 'review' ? reviewDraft(rowId, tenantId, ctx) : chatDraft(rowId, tenantId, ctx);
}

module.exports = {
  draftReply,
  ReplyDraftError,
  sanitizeFacts,
  TYPES,
  REPLY_LIMIT,
  HISTORY_MESSAGES,
  greeting,
};
