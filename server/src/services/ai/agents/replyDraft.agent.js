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
 * Brand-side reply drafting (docs/29 Phase 3c). A shop asks for the words to
 * answer one of its own reviews or one of its own customer chats and gets a
 * draft back — nothing more. The chat draft goes into the composer and the
 * ordinary send endpoint re-checks membership, permissions and whether the
 * seller is open; a review draft has no publish path at all yet, because
 * CityCart has no brand reply on a review, so the shop only ever reads it.
 *
 * Both halves read by id inside the caller's own tenant, and a row that is not
 * this shop's answers 404 — the same anti-probing answer the chat services
 * give. What reaches the provider is names, a stored rating and the customer's
 * own text: never a price, a stock count, an order state or a payment field, so
 * the model has nothing to misquote and no reason to promise.
 */
const TYPES = ['review', 'chat'];
const CUSTOMER_SIDE = 'CUSTOMER';

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
  const subject =
    type === 'review' ? await reviewSubject(rowId, tenantId) : await chatSubject(rowId, tenantId);

  const result = await generate({
    task: 'reply-draft',
    messages: buildReplyDraftMessages(subject),
    json: true,
    temperature: 0.4,
    maxTokens: 500,
    userId: ctx.userId,
    role: ctx.role,
  });

  const parsed = parseModelJson(result.text, modelSchema);
  return { draft: parsed.draft };
}

module.exports = {
  draftReply,
  ReplyDraftError,
  TYPES,
  REPLY_LIMIT,
  HISTORY_MESSAGES,
  greeting,
};
