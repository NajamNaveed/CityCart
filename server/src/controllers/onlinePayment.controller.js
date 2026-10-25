const { orderIdParamSchema, listPaymentEventsQuerySchema, mockCheckoutParamsSchema, mockCheckoutChoiceSchema } = require('../validators/payment.validator');
const {
  listPaymentMethods,
  startOnlineCheckout,
  processWebhook,
  completeMockCheckout,
  getMockCheckoutDetails,
  listPaymentEvents,
} = require('../services/onlinePayment.service');
const { OrderError } = require('../services/order.service');
const { formatZodError } = require('../utils/formatZodError');
const env = require('../config/env');

const formatPrice = (amount) => `Rs ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof OrderError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

// What the customer can pay with right now.
function methods(req, res) {
  return res.status(200).json({ success: true, methods: listPaymentMethods() });
}

// Where to send the customer to pay one online order. The order is looked up by its owner,
// so nobody can start (or learn anything about) someone else's payment.
async function startCheckout(req, res, next) {
  const params = orderIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const session = await startOnlineCheckout({ userId: req.user._id, orderId: params.data.orderId });
    return res.status(200).json({ success: true, ...session });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/**
 * The gateway's notification. NOT authenticated like a user: it is verified by its signature
 * over the raw body. Everything that was understood is answered 200 (including duplicates and
 * the cases recorded for review) so the gateway stops retrying; only a bad signature or a
 * malformed body is refused.
 */
async function webhook(req, res, next) {
  try {
    const result = await processWebhook(req.params.provider, req.rawBody || Buffer.alloc(0), req.headers);
    return res.status(200).json({ success: true, received: true, outcome: result.outcome });
  } catch (err) {
    // A bad signature (401), a malformed body (400) or an unknown provider (404) carry their own status.
    if (err && typeof err.status === 'number') {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

// --- The test gateway's hosted page (only exists while the test gateway is on) ---
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Where a customer on a computer goes back to afterwards (the phone app simply returns to the app).
const backLink = () => `<p class="note"><a href="${escapeHtml(env.clientUrl)}/orders">Back to my orders</a></p>`;

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f8f9fa;color:#020617;margin:0;padding:24px}main{max-width:420px;margin:40px auto;background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:24px}h1{font-size:20px;margin:0 0 8px}p{color:#64748b;margin:0 0 16px}button{width:100%;min-height:48px;margin-top:8px;border-radius:8px;border:1px solid #1e3a2f;font-size:16px;cursor:pointer}.pay{background:#1e3a2f;color:#fff}.fail{background:#fff;color:#b42318;border-color:#b42318}.note{font-size:12px}</style></head><body><main>${body}</main></body></html>`;

async function mockPage(req, res, next) {
  const params = mockCheckoutParamsSchema.safeParse(req.params);
  if (!params.success) return res.status(404).type('html').send(page('Not found', '<h1>Not found</h1>'));
  try {
    const { payment, orderNumber } = await getMockCheckoutDetails(params.data.reference);
    if (payment.status !== 'PENDING') {
      return res.status(200).type('html').send(page('Payment', `<h1>Nothing to pay</h1><p>This payment is ${escapeHtml(payment.status.toLowerCase())}. You can close this page and go back to CityCart.</p>${backLink()}`));
    }
    const ref = escapeHtml(params.data.reference);
    return res.status(200).type('html').send(
      page(
        'Test payment',
        `<h1>Test gateway</h1><p>Pay ${escapeHtml(formatPrice(payment.amount))} for order ${escapeHtml(orderNumber)}.</p>
<form method="post" action="/api/v1/payments/mock-checkout/${ref}/pay"><button class="pay" type="submit">Pay now</button></form>
<form method="post" action="/api/v1/payments/mock-checkout/${ref}/fail"><button class="fail" type="submit">Fail this payment</button></form>
<p class="note">This is a TEST gateway for demos. No real money moves.</p>${backLink()}`
      )
    );
  } catch (err) {
    if (err instanceof OrderError) return res.status(404).type('html').send(page('Not found', '<h1>Not found</h1>'));
    return next(err);
  }
}

async function mockComplete(req, res, next) {
  const params = mockCheckoutChoiceSchema.safeParse(req.params);
  if (!params.success) return res.status(404).type('html').send(page('Not found', '<h1>Not found</h1>'));
  try {
    const result = await completeMockCheckout(params.data.reference, params.data.choice);
    const text =
      result.outcome === 'PAID'
        ? '<h1>Payment received</h1><p>Thank you. You can close this page and go back to CityCart.</p>' + backLink()
        : '<h1>Payment did not go through</h1><p>You can close this page and try again from CityCart.</p>' + backLink();
    return res.status(200).type('html').send(page('Payment', text));
  } catch (err) {
    if (err instanceof OrderError) return res.status(404).type('html').send(page('Not found', '<h1>Not found</h1>'));
    return next(err);
  }
}

// Super admin: what the gateway told us, and the cases that need a human.
async function events(req, res, next) {
  const parsed = listPaymentEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listPaymentEvents(parsed.data);
    return res.status(200).json({ success: true, events: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { methods, startCheckout, webhook, mockPage, mockComplete, events };
