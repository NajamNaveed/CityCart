const express = require('express');

const {
  ping,
  listingDraft,
  reviewSummary,
  translate,
  shopAssistant,
  orderHelper,
  serviceHelper,
  recipeList,
  compare,
  chatDraft,
  chat,
  replyDraft,
  returnsInsights,
  restockCalendar,
  listingQuality,
  shopReport,
  sellerAdvisor,
  catalogueMatch,
  csvClean,
} = require('../controllers/ai.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { chatAccess } = require('../middleware/chatAccess');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
const { requireAiEnabled, aiDailyLimit } = require('../middleware/aiAccess');
const { aiUserLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Signed-in first, then role, then the kill switch, then the per-user burst
// cap, then the daily allowance (docs/29 Phase 0c). Later agent routes reuse
// this chain.
router.post('/ping', authenticate, requireAiEnabled, aiUserLimiter, aiDailyLimit, ping);

router.post(
  '/listing-draft',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  listingDraft,
);

router.get(
  '/products/:id/review-summary',
  authenticate,
  validateObjectIdParam,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  reviewSummary,
);

// Store chat only (customer and brand team). chatAccess rejects every other
// role before the message is even loaded; the agent then checks that the
// caller is a participant of the message's own conversation.
router.post(
  '/translate',
  authenticate,
  chatAccess,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  translate,
);

// Phase 2g: one chat for every customer assistant. The server routes the
// message to the same scoped agent a mode button used to choose, so the client
// no longer needs modes and the tool scope stays server-side.
router.post(
  '/chat',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  chat,
);

// Phase 2a: the customer shopping assistant. It may call several tools per
// question, so the daily allowance is spent per provider call (see docs/05 §23a).
router.post(
  '/shop-assistant',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  shopAssistant,
);

// Phase 2b: questions about the caller's own orders. The tools take the
// customer id from the authenticated request; no id is ever read from the body.
router.post(
  '/order-helper',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  orderHelper,
);

// Phase 2c: find a service provider and its free times. The tools only read
// public provider data and published availability; no booking is created.
router.post(
  '/service-helper',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  serviceHelper,
);

// Phase 2d: recipe -> shopping list. The model only extracts ingredients; the
// products in the list come from the ordinary public search, and the shopper
// adds them through the normal cart.
router.post(
  '/recipe-list',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  recipeList,
);

// Phase 2e: side-by-side comparison. The response cards come from the
// comparison tool only; the model picks which of them to show.
router.post(
  '/compare',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  compare,
);

// Phase 2f: draft the customer's next message in a provider or booking thread.
// The agent loads the thread itself and checks the caller owns it, so the body
// carries only the kind, the id and the customer's intent.
router.post(
  '/chat-draft',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  chatDraft,
);

// Phase 3a: the seller advisor. Same authorization chain as the brand
// analytics charts it explains (analytics.view + the caller's own tenant), then
// the usual AI guards. The brand is taken from requireTenant, never from the
// body, and every tool reads only that brand.
router.post(
  '/seller-advisor',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  sellerAdvisor,
);

// Phase 3b: the catalogue matcher. It answers a question the catalogue picker
// cannot: "does this already exist, and do I already sell it?" Same gates as the
// catalogue request it replaces (products.create + the caller's own tenant), so
// an employee who cannot request a product cannot run the check either. The
// shop's identity comes from requireTenant, never from the body.
router.post(
  '/catalogue-match',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.PRODUCTS_CREATE),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  catalogueMatch,
);

// Phase 3b: the CSV cleaner. It reads the file exactly the way the import does
// (text/csv body, the same 1mb cap) and needs the same two permissions, so an
// employee who cannot import is not shown a preview of an import either. The
// guards run before the body is read: a refusal never parses a file. Nothing
// here writes — the brand takes the cleaned text back to POST /products/import.
router.post(
  '/csv-clean',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.PRODUCTS_CREATE),
  requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  express.text({ type: 'text/csv', limit: '1mb' }),
  csvClean,
);

// Phase 3c: the reply drafter. A shop asks for the words to answer one of its
// own reviews or one of its own customer chats. Either of the two permissions
// is enough to reach the route, and the handler then demands the one that
// matches the requested type, so a team member who may only read reviews
// cannot draft chat replies and one who may only chat cannot draft review
// replies. The shop comes from requireTenant, never from the body, and the
// draft is only text: the chat reply still goes through POST
// /chats/:id/messages, which re-checks membership and permissions.
router.post(
  '/reply-draft',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.MESSAGES_MANAGE),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  replyDraft,
);

// Phase 3d-1: why this shop's orders come back. It answers the returned-goods
// inbox, so it runs on exactly that inbox's guards — delivery.view and the
// tenant from the session (docs/29 §3e; the same chain as GET /returns). The
// window and an optional return id are the only input, and both are read
// inside that tenant. Nothing here changes a return, a refund or stock: the
// counts come from the server's own arithmetic and the model only explains
// them, and the drafted reply is text the shop copies.
router.post(
  '/returns-insights',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.DELIVERY_VIEW),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  returnsInsights,
);

// Phase 3d-2: the restock calendar. It answers "what should I have bought last
// week?" from this shop's own delivered weeks and its own stock rows, so it runs
// on analytics.view — the same guard as GET /brand/analytics, the dashboard the
// numbers have to agree with. The shop comes from requireTenant, never from the
// body; the only input is a window length. Weekly units, weeks of cover and
// suggested units are CityCart's arithmetic, the model only explains them, and
// no order, inventory or product document is written.
router.post(
  '/restock-calendar',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  restockCalendar,
);

// Phase 3d-3: the listing quality score. It answers "why is this page not
// selling?" about one listing the shop names, so it runs on products.view — the
// same guard as GET /products/mine, the screen the score has to agree with. The
// listing is read inside the tenant requireTenant resolved from the session, so
// another shop's page scores nothing and 404s like a missing one; the score is
// CityCart's own arithmetic over the record's fields, the model only re-words
// the gaps it found, and the listing is never written.
router.post(
  '/listing-quality',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  listingQuality,
);

// Phase 3d-4: the weekly shop report. It answers "how did the shop do this
// week?" from the same getBrandAnalytics numbers the dashboard tiles and charts
// are drawn from, over this week and the equal week before it, so the paragraph
// cannot disagree with the chart above it. It runs on analytics.view — the same
// guard as GET /brand/analytics. The shop comes from requireTenant, never from
// the body; every rupee, order and unit figure is counted by CityCart, and no
// report is stored, mailed or scheduled.
router.post(
  '/shop-report',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  requireTenant,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  shopReport,
);

module.exports = router;
