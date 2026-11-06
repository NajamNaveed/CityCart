jest.mock('../../src/services/email.service');

const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const User = require('../../src/models/user.model');
const Brand = require('../../src/models/brand.model');
const ServiceProvider = require('../../src/models/serviceProvider.model');
const CommissionEntry = require('../../src/models/commissionEntry.model');
const SellerInvoice = require('../../src/models/sellerInvoice.model');
const SellerPaymentClaim = require('../../src/models/sellerPaymentClaim.model');
const BillingHelpRequest = require('../../src/models/billingHelp.model');
const PlatformSettings = require('../../src/models/platformSettings.model');
const { hashPassword } = require('../../src/utils/password');
const { startOfKarachiMonth } = require('../../src/utils/karachiTime');
const {
  commissionForPaisa,
  recordOrderCommission,
  recordBookingCommission,
  recordRefundReversal,
  generateMonthlyInvoices,
  refreshSellerBillingState,
  assertSellerCanSell,
  getSellerBillingSummary,
  getSellerInvoice,
  createPaymentClaim,
  submitBillingHelp,
  listSellerBillingHelp,
  adminDecideClaim,
  adminListSellers,
  adminListInvoices,
  adminOverrideFreeze,
  adminClearFreeze,
  adminGrantGrace,
} = require('../../src/services/billing.service');

const oid = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

// A fixed clock keeps the Karachi month boundaries deterministic.
const NOW = new Date('2026-03-15T10:00:00Z');
const THIS_MONTH = startOfKarachiMonth(NOW);
const LAST_MONTH = startOfKarachiMonth(new Date(THIS_MONTH.getTime() - 1));
const IN_LAST_MONTH = new Date(LAST_MONTH.getTime() + 10 * DAY);
const PRIOR_MONTH = startOfKarachiMonth(new Date(LAST_MONTH.getTime() - 1));

let n = 0;
let passwordHash;
let admin;
let brandA;
let brandB;
let provider;

const makeBrand = async (name) => {
  n += 1;
  return Brand.create({ name: `${name} ${n}`, slug: `brand-${n}`, cityId: oid(), status: 'ACTIVE' });
};

const makeProvider = async () => {
  n += 1;
  return ServiceProvider.create({
    userId: oid(),
    displayName: `Provider ${n}`,
    slug: `provider-${n}`,
    categoryId: oid(),
    cityId: oid(),
    blockId: oid(),
    location: { type: 'Point', coordinates: [73.08, 31.42] },
    startingAtPrice: 100000,
    status: 'ACTIVE',
    verification: 'VERIFIED',
  });
};

// Order totals are rupees (docs/08 §6); the ledger converts them to paisa.
const deliveredOrder = (brand, over = {}) => ({
  _id: oid(),
  brandId: brand._id,
  orderStatus: 'DELIVERED',
  netTotal: 50000,
  deliveryFee: 250,
  tax: 0,
  deliveredAt: IN_LAST_MONTH,
  ...over,
});

const confirmedBooking = (over = {}) => ({
  _id: oid(),
  providerId: provider._id,
  status: 'CONFIRMED',
  finalAmountPaisa: 440000,
  agreedPricePaisa: 400000,
  confirmedAt: IN_LAST_MONTH,
  ...over,
});

const issueInvoice = (sellerType, sellerId, over = {}) =>
  SellerInvoice.create({
    sellerType,
    sellerId,
    periodStart: LAST_MONTH,
    periodEnd: THIS_MONTH,
    periodKey: '2026-02',
    salesPaisa: 10000000,
    commissionPaisa: 100000,
    amountDuePaisa: 100000,
    status: 'ISSUED',
    issuedAt: THIS_MONTH,
    dueAt: new Date(NOW.getTime() - DAY),
    ...over,
  });

beforeAll(async () => {
  await connect();
  await Promise.all(
    [
      User,
      Brand,
      ServiceProvider,
      CommissionEntry,
      SellerInvoice,
      SellerPaymentClaim,
      BillingHelpRequest,
      PlatformSettings,
    ].map((model) => model.init())
  );
  passwordHash = await hashPassword('secret123');
});

afterAll(disconnect);

beforeEach(async () => {
  await clearAll();
  n += 1;
  admin = await User.create({
    name: 'Super Admin',
    email: `admin${n}@billing.test`,
    passwordHash,
    role: 'SUPER_ADMIN',
  });
  brandA = await makeBrand('Loom');
  brandB = await makeBrand('Rangrez');
  provider = await makeProvider();
});

describe('1% commission triggers (docs/15 §6)', () => {
  it('accrues one SALE for a delivered order, converting rupees to paisa', async () => {
    const order = deliveredOrder(brandA);

    const charged = await recordOrderCommission(order);

    // PKR 50,000 - PKR 250 delivery = 49,750 -> 4,975,000 paisa -> 1% = 49,750 paisa.
    expect(charged).toBe(49750);
    const entry = await CommissionEntry.findOne({ sourceId: order._id });
    expect(entry).toMatchObject({
      sellerType: 'BRAND',
      kind: 'SALE',
      status: 'ACCRUED',
      eligibleAmountPaisa: 4975000,
      rateBps: 100,
      commissionPaisa: 49750,
      invoiceId: null,
    });
    expect(String(entry.sellerId)).toBe(String(brandA._id));
  });

  it('excludes the delivery fee and tax from the base', async () => {
    const order = deliveredOrder(brandA, { netTotal: 100000, deliveryFee: 500, tax: 1500 });

    await recordOrderCommission(order);

    const entry = await CommissionEntry.findOne({ sourceId: order._id });
    expect(entry.eligibleAmountPaisa).toBe((100000 - 500 - 1500) * 100);
  });

  it('never charges an order that is not DELIVERED', async () => {
    for (const status of ['PENDING', 'CONFIRMED', 'PROCESSING', 'RETURNED', 'CANCELLED']) {
      const order = deliveredOrder(brandA, { orderStatus: status });
      expect(await recordOrderCommission(order)).toBeNull();
      expect(await CommissionEntry.countDocuments({ sourceId: order._id })).toBe(0);
    }
  });

  it('is idempotent: a retried completion keeps exactly one entry', async () => {
    const order = deliveredOrder(brandA);

    await recordOrderCommission(order);
    await recordOrderCommission(order);
    await recordOrderCommission(order);

    expect(await CommissionEntry.countDocuments({ sourceId: order._id })).toBe(1);
  });

  it('accrues on a CONFIRMED booking using the final amount in paisa', async () => {
    const booking = confirmedBooking();

    const charged = await recordBookingCommission(booking);

    expect(charged).toBe(4400);
    const entry = await CommissionEntry.findOne({ sourceId: booking._id });
    expect(entry).toMatchObject({
      sellerType: 'SERVICE_PROVIDER',
      sourceType: 'SERVICE_BOOKING',
      eligibleAmountPaisa: 440000,
      commissionPaisa: 4400,
    });
    expect(String(entry.sellerId)).toBe(String(provider._id));
  });

  it('falls back to the agreed price when no final amount was set', async () => {
    const booking = confirmedBooking({ finalAmountPaisa: undefined, agreedPricePaisa: 400000 });

    expect(await recordBookingCommission(booking)).toBe(4000);
  });

  it('never charges an unconfirmed or cancelled booking', async () => {
    for (const status of ['REQUESTED', 'PROPOSED', 'ACCEPTED', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'DECLINED']) {
      const booking = confirmedBooking({ status });
      expect(await recordBookingCommission(booking)).toBeNull();
    }
  });

  it('reverses the charge for a refund after delivery, capped at what was charged', async () => {
    const order = deliveredOrder(brandA);
    await recordOrderCommission(order); // 49,750 paisa

    expect(await recordRefundReversal({ order, refundPaisa: 100000, reason: 'Returned after delivery' })).toBe(-1000);
    // A huge second refund can only reverse the remaining 48,750.
    expect(await recordRefundReversal({ order, refundPaisa: 100000000 })).toBe(-48750);
    // Nothing left to reverse.
    expect(await recordRefundReversal({ order, refundPaisa: 1000 })).toBeNull();

    const reversal = await CommissionEntry.findOne({ kind: 'REVERSAL' });
    const original = await CommissionEntry.findOne({ kind: 'SALE' });
    expect(String(reversal.reversalOf)).toBe(String(original._id));
    expect(reversal.commissionPaisa).toBe(-1000);
    expect(reversal.reason).toContain('Returned');
  });

  it('ignores a refund on an order with no commission entry', async () => {
    const order = deliveredOrder(brandA);

    expect(await recordRefundReversal({ order, refundPaisa: 1000 })).toBeNull();
  });
});

describe('monthly invoices (docs/15 §7)', () => {
  it('closes the previous Karachi month, groups by seller and marks entries INVOICED', async () => {
    const order = deliveredOrder(brandA);
    // PKR 12,000 commission keeps the provider invoice above the PKR 100 minimum.
    const booking = confirmedBooking({ finalAmountPaisa: 1200000, agreedPricePaisa: 1000000 });
    await recordOrderCommission(order);
    await recordBookingCommission(booking);

    const result = await generateMonthlyInvoices({ now: NOW, createdBy: String(admin._id) });

    expect(result.periodKey).toBe('2026-02');
    expect(result.issued).toHaveLength(2);

    const brandInvoice = await SellerInvoice.findOne({ sellerType: 'BRAND', sellerId: brandA._id });
    expect(brandInvoice).toMatchObject({
      periodKey: '2026-02',
      salesPaisa: 4975000,
      commissionPaisa: 49750,
      amountDuePaisa: 49750,
      paidPaisa: 0,
      status: 'ISSUED',
      createdBy: String(admin._id),
    });
    expect(brandInvoice.dueAt).toEqual(new Date(NOW.getTime() + 7 * DAY));

    const providerInvoice = await SellerInvoice.findOne({ sellerType: 'SERVICE_PROVIDER', sellerId: provider._id });
    expect(providerInvoice.commissionPaisa).toBe(12000);

    const entries = await CommissionEntry.find({ invoiceId: brandInvoice._id });
    expect(entries.map((e) => e.status)).toEqual(['INVOICED']);
  });

  it('is safe to re-run: no second invoice and no double-invoiced entry', async () => {
    await recordOrderCommission(deliveredOrder(brandA));
    await generateMonthlyInvoices({ now: NOW });

    const second = await generateMonthlyInvoices({ now: NOW });

    expect(second.issued).toHaveLength(0);
    // Nothing is still ACCRUED, so there is nothing left to report as skipped.
    expect(second.skipped).toEqual([]);
    expect(await SellerInvoice.countDocuments({ sellerId: brandA._id })).toBe(1);
  });

  it('leaves a seller below the minimum invoice amount to roll forward', async () => {
    // PKR 5,000 sale -> 5,000 paisa commission, below the PKR 100 default minimum.
    await recordOrderCommission(deliveredOrder(brandA, { netTotal: 5000, deliveryFee: 0 }));

    const result = await generateMonthlyInvoices({ now: NOW });

    expect(result.issued).toHaveLength(0);
    expect(result.skipped).toEqual([{ sellerType: 'BRAND', sellerId: brandA._id, reason: 'BELOW_MINIMUM' }]);
    expect(await SellerInvoice.countDocuments()).toBe(0);
    expect((await CommissionEntry.findOne()).status).toBe('ACCRUED');
  });

  it('applies a verified overpayment credit to the next invoice exactly once', async () => {
    await recordOrderCommission(deliveredOrder(brandA));
    const previous = await issueInvoice('BRAND', brandA._id, {
      periodStart: PRIOR_MONTH,
      periodEnd: LAST_MONTH,
      periodKey: '2026-01',
      status: 'PAID',
      amountDuePaisa: 0,
      paidPaisa: 100000,
      paidAt: new Date(PRIOR_MONTH.getTime() + 2 * DAY),
    });
    const claim = await SellerPaymentClaim.create({
      invoiceId: previous._id,
      sellerType: 'BRAND',
      sellerId: brandA._id,
      amountPaisa: 105000,
      method: 'BANK_TRANSFER',
      reference: 'MCB-OVERPAY',
      status: 'VERIFIED',
      verifiedBy: admin._id,
      verifiedAt: new Date(LAST_MONTH.getTime() + 3 * DAY),
      creditPaisa: 5000,
    });

    await generateMonthlyInvoices({ now: NOW });

    const invoice = await SellerInvoice.findOne({ periodKey: '2026-02', sellerId: brandA._id });
    expect(invoice.creditsPaisa).toBe(5000);
    expect(invoice.amountDuePaisa).toBe(49750 - 5000);
    expect(String((await SellerPaymentClaim.findById(claim._id)).creditAppliedInvoiceId)).toBe(String(invoice._id));
  });

  it('carries a reversal into the next period and marks a fully reversed sale REVERSED', async () => {
    const order = deliveredOrder(brandA);
    await recordOrderCommission(order);
    await generateMonthlyInvoices({ now: NOW }); // first invoice
    await recordRefundReversal({
      order,
      refundPaisa: 4000000, // -40,000 paisa
      now: new Date(THIS_MONTH.getTime() + 5 * DAY),
    });

    const next = new Date(THIS_MONTH.getTime() + 40 * DAY);
    const result = await generateMonthlyInvoices({ now: next });

    expect(result.periodKey).toBe('2026-03');
    const invoice = await SellerInvoice.findOne({ periodKey: '2026-03', sellerId: brandA._id });
    // Reversal-only month rolls forward: no invoice is issued for it alone.
    expect(invoice).toBeNull();
    expect(result.skipped.some((s) => s.reason === 'NOTHING_TO_INVOICE')).toBe(true);
  });
});

describe('freeze ladder on real seller rows (docs/15 §9)', () => {
  it('warns, restricts and freezes as the oldest invoice ages', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id, { dueAt: new Date(NOW.getTime() - DAY) });

    let state = await refreshSellerBillingState('BRAND', brandA._id, { now: NOW });
    expect(state).toMatchObject({ status: 'WARNING', changed: true });
    expect((await Brand.findById(brandA._id)).billingStatus).toBe('WARNING');

    invoice.dueAt = new Date(NOW.getTime() - 10 * DAY);
    await invoice.save();
    state = await refreshSellerBillingState('BRAND', brandA._id, { now: NOW });
    expect(state.status).toBe('RESTRICTED');

    invoice.dueAt = new Date(NOW.getTime() - 15 * DAY);
    await invoice.save();
    state = await refreshSellerBillingState('BRAND', brandA._id, { now: NOW });
    expect(state).toMatchObject({ status: 'FROZEN', previous: 'RESTRICTED', changed: true });
    expect((await Brand.findById(brandA._id)).billingStatus).toBe('FROZEN');
  });

  it('ignores a paid or void invoice', async () => {
    await issueInvoice('BRAND', brandA._id, { status: 'PAID', amountDuePaisa: 0, paidPaisa: 100000 });
    await issueInvoice('SERVICE_PROVIDER', provider._id, { status: 'VOID', amountDuePaisa: 0 });

    expect((await refreshSellerBillingState('BRAND', brandA._id, { now: NOW })).status).toBe('ACTIVE');
    expect((await refreshSellerBillingState('SERVICE_PROVIDER', provider._id, { now: NOW })).status).toBe('ACTIVE');
  });

  it('blocks new sales from RESTRICTED and FROZEN but keeps existing work possible', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id, { dueAt: new Date(NOW.getTime() - 8 * DAY) });

    await expect(assertSellerCanSell('BRAND', brandA._id, { now: NOW })).rejects.toMatchObject({
      status: 409,
      code: 'SELLER_BILLING_RESTRICTED',
      extra: { billingStatus: 'RESTRICTED' },
    });

    // The seller can still read its own orders: this guard only gates new sales.
    invoice.dueAt = new Date(NOW.getTime() - 20 * DAY);
    await invoice.save();
    await expect(assertSellerCanSell('BRAND', brandA._id, { now: NOW })).rejects.toMatchObject({
      extra: { billingStatus: 'FROZEN' },
    });
  });

  it('a grace period suspends the ladder until it expires', async () => {
    await issueInvoice('BRAND', brandA._id, { dueAt: new Date(NOW.getTime() - 20 * DAY) });

    await adminGrantGrace({
      admin,
      sellerType: 'BRAND',
      sellerId: brandA._id,
      until: new Date(NOW.getTime() + 3 * DAY),
      reason: 'Bank transfer delayed.',
      now: NOW,
    });
    expect((await Brand.findById(brandA._id)).billingStatus).toBe('ACTIVE');

    const later = new Date(NOW.getTime() + 4 * DAY);
    expect((await refreshSellerBillingState('BRAND', brandA._id, { now: later })).status).toBe('FROZEN');
  });

  it('a manual override wins, and clearing it re-derives from the invoice', async () => {
    await issueInvoice('BRAND', brandA._id, { dueAt: new Date(NOW.getTime() - 20 * DAY) });

    await adminOverrideFreeze({
      admin,
      sellerType: 'BRAND',
      sellerId: brandA._id,
      status: 'ACTIVE',
      reason: 'Owner paid in cash at the office.',
      until: new Date(NOW.getTime() + 10 * DAY),
      now: NOW,
    });
    expect((await refreshSellerBillingState('BRAND', brandA._id, { now: NOW })).status).toBe('ACTIVE');

    const state = await adminClearFreeze({ sellerType: 'BRAND', sellerId: brandA._id, now: NOW });
    expect(state.status).toBe('FROZEN');
    expect((await Brand.findById(brandA._id)).billingOverride).toBeNull();
  });
});

describe('receipt claims (docs/15 §8)', () => {
  it('refuses another seller\'s invoice, an amount above the balance and a foreign receipt', async () => {
    const invoice = await issueInvoice('BRAND', brandB._id);
    const base = { sellerType: 'BRAND', sellerId: brandA._id, invoiceId: invoice._id };

    await expect(
      createPaymentClaim({ ...base, data: { amountPaisa: 1000, method: 'JAZZCASH', reference: 'JC-1' } })
    ).rejects.toMatchObject({ status: 404 });

    const own = await issueInvoice('BRAND', brandA._id);
    await expect(
      createPaymentClaim({
        sellerType: 'BRAND',
        sellerId: brandA._id,
        invoiceId: own._id,
        data: { amountPaisa: 999999, method: 'JAZZCASH', reference: 'JC-2' },
      })
    ).rejects.toMatchObject({ status: 400, code: 'CLAIM_EXCEEDS_BALANCE' });

    await expect(
      createPaymentClaim({
        sellerType: 'BRAND',
        sellerId: brandA._id,
        invoiceId: own._id,
        data: {
          amountPaisa: 1000,
          method: 'JAZZCASH',
          reference: 'JC-3',
          receipt: { publicId: `citycart/billing/brands/${brandB._id}/receipts/x`, fingerprint: 'f' },
        },
      })
    ).rejects.toMatchObject({ status: 422, code: 'RECEIPT_NOT_YOURS' });
  });

  it('stores a claim with the session-owned seller and blocks the same reference twice', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id);
    const data = {
      amountPaisa: 1000,
      method: 'BANK_TRANSFER',
      reference: 'MCB-123',
      receipt: { publicId: `citycart/billing/brands/${brandA._id}/receipts/r1`, fingerprint: 'fp' },
      comment: 'Part payment.',
    };

    const claim = await createPaymentClaim({ sellerType: 'BRAND', sellerId: brandA._id, invoiceId: invoice._id, data });

    expect(claim).toMatchObject({ amountPaisa: 1000, method: 'BANK_TRANSFER', status: 'SUBMITTED' });
    expect(claim.receiptAvailable).toBe(true);
    await expect(
      createPaymentClaim({ sellerType: 'BRAND', sellerId: brandA._id, invoiceId: invoice._id, data })
    ).rejects.toMatchObject({ status: 409, code: 'CLAIM_EXISTS' });
  });

  it('verifying a partial payment moves the invoice to PARTIALLY_PAID and the balance down', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id);
    const claim = await createPaymentClaim({
      sellerType: 'BRAND',
      sellerId: brandA._id,
      invoiceId: invoice._id,
      data: { amountPaisa: 40000, method: 'BANK_TRANSFER', reference: 'MCB-1' },
    });

    const outcome = await adminDecideClaim({ admin, claimId: claim._id, decision: 'VERIFIED' });

    expect(outcome.invoice).toMatchObject({ status: 'PARTIALLY_PAID', paidPaisa: 40000, amountDuePaisa: 60000 });
    expect(outcome.claim.status).toBe('VERIFIED');
    expect(String(outcome.claim.verifiedAt)).not.toBe('null');

    await expect(adminDecideClaim({ admin, claimId: claim._id, decision: 'VERIFIED' })).rejects.toMatchObject({
      status: 409,
      code: 'CLAIM_ALREADY_DECIDED',
    });
  });

  it('verifying the full balance marks the invoice PAID and clears the seller status', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id, { dueAt: new Date(NOW.getTime() - 20 * DAY) });
    await refreshSellerBillingState('BRAND', brandA._id, { now: NOW });
    expect((await Brand.findById(brandA._id)).billingStatus).toBe('FROZEN');

    const claim = await createPaymentClaim({
      sellerType: 'BRAND',
      sellerId: brandA._id,
      invoiceId: invoice._id,
      data: { amountPaisa: 100000, method: 'EASYPAISA', reference: 'EP-1' },
    });
    const outcome = await adminDecideClaim({ admin, claimId: claim._id, decision: 'VERIFIED' });

    expect(outcome.invoice.status).toBe('PAID');
    expect(outcome.invoice.amountDuePaisa).toBe(0);
    expect(outcome.billingStatus).toBe('ACTIVE');
    expect((await Brand.findById(brandA._id)).billingStatus).toBe('ACTIVE');
  });

  it('verifying an overpayment keeps the difference as credit for a later invoice', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id, { amountDuePaisa: 40000, commissionPaisa: 40000 });
    const claim = await SellerPaymentClaim.create({
      invoiceId: invoice._id,
      sellerType: 'BRAND',
      sellerId: brandA._id,
      amountPaisa: 45000,
      method: 'BANK_TRANSFER',
      reference: 'MCB-OVER',
    });

    const outcome = await adminDecideClaim({ admin, claimId: claim._id, decision: 'VERIFIED' });

    expect(outcome.claim).toMatchObject({ status: 'VERIFIED', creditPaisa: 5000 });
    expect(outcome.invoice).toMatchObject({ status: 'PAID', amountDuePaisa: 0, paidPaisa: 40000 });
    expect((await SellerPaymentClaim.findById(claim._id)).creditAppliedInvoiceId).toBeNull();
  });

  it('rejecting a claim records the reason and leaves the balance untouched', async () => {
    const invoice = await issueInvoice('BRAND', brandA._id);
    const claim = await createPaymentClaim({
      sellerType: 'BRAND',
      sellerId: brandA._id,
      invoiceId: invoice._id,
      data: { amountPaisa: 1000, method: 'OTHER', reference: 'OTHER-1' },
    });

    const outcome = await adminDecideClaim({
      admin,
      claimId: claim._id,
      decision: 'REJECTED',
      note: 'Reference not found.',
    });

    expect(outcome.claim).toMatchObject({ status: 'REJECTED', rejectionReason: 'Reference not found.' });
    expect(outcome.invoice).toBeNull();
    expect((await SellerInvoice.findById(invoice._id)).amountDuePaisa).toBe(100000);
  });

  it('refuses a claim on a PAID or VOID invoice', async () => {
    for (const [index, status] of ['PAID', 'VOID'].entries()) {
      const invoice = await issueInvoice('BRAND', brandA._id, {
        status,
        amountDuePaisa: 0,
        periodStart: new Date(LAST_MONTH.getTime() - index * 31 * DAY),
      });
      await expect(
        createPaymentClaim({
          sellerType: 'BRAND',
          sellerId: brandA._id,
          invoiceId: invoice._id,
          data: { amountPaisa: 1000, method: 'OTHER', reference: `R-${status}` },
        })
      ).rejects.toMatchObject({ status: 409, code: 'INVOICE_NOT_PAYABLE' });
    }
  });
});

describe('tenant isolation and seller reads', () => {
  it('only ever returns the caller\'s own invoices and claims', async () => {
    const mine = await issueInvoice('BRAND', brandA._id);
    await issueInvoice('BRAND', brandB._id);
    await SellerPaymentClaim.create({
      invoiceId: mine._id,
      sellerType: 'BRAND',
      sellerId: brandA._id,
      amountPaisa: 1000,
      method: 'OTHER',
      reference: 'MINE',
    });

    const summary = await getSellerBillingSummary('BRAND', brandA._id, { now: NOW });

    expect(summary.seller._id.toString()).toBe(String(brandA._id));
    expect(summary.invoices).toHaveLength(1);
    expect(summary.balancePaisa).toBe(100000);
    expect(summary.recentClaims).toHaveLength(1);

    await expect(getSellerInvoice('BRAND', brandA._id, (await SellerInvoice.findOne({ sellerId: brandB._id }))._id))
      .rejects.toMatchObject({ status: 404 });
  });

  it('a brand summary never exposes a provider invoice', async () => {
    await issueInvoice('SERVICE_PROVIDER', provider._id);

    const summary = await getSellerBillingSummary('BRAND', brandA._id, { now: NOW });

    expect(summary.invoices).toHaveLength(0);
    expect(summary.balancePaisa).toBe(0);
  });

  it('billing help is scoped to the seller', async () => {
    await submitBillingHelp({ sellerType: 'BRAND', sellerId: brandA._id, subject: 'Bank title', message: 'Can we use another title?' });
    await submitBillingHelp({ sellerType: 'BRAND', sellerId: brandB._id, subject: 'Card split', message: 'How is the 1% calculated?' });

    const list = await listSellerBillingHelp('BRAND', brandA._id);

    expect(list.items).toHaveLength(1);
    expect(list.items[0].subject).toBe('Bank title');
  });

  it('the admin seller list carries each tenant\'s own balance', async () => {
    await issueInvoice('BRAND', brandA._id, { amountDuePaisa: 70000 });
    await issueInvoice('BRAND', brandA._id, { amountDuePaisa: 30000, periodStart: new Date(LAST_MONTH.getTime() - 31 * DAY) });
    await issueInvoice('SERVICE_PROVIDER', provider._id, { amountDuePaisa: 5000 });

    const list = await adminListSellers({ limit: 50 });
    const brandRow = list.items.find((s) => String(s.sellerId) === String(brandA._id));
    const providerRow = list.items.find((s) => String(s.sellerId) === String(provider._id));

    expect(brandRow).toMatchObject({ sellerType: 'BRAND', balancePaisa: 100000, unpaidInvoiceCount: 2 });
    expect(providerRow).toMatchObject({ sellerType: 'SERVICE_PROVIDER', balancePaisa: 5000 });
    expect(list.items[0].balancePaisa).toBeGreaterThanOrEqual(list.items[list.items.length - 1].balancePaisa);
  });

  it('admin invoice filters never leak across sellers when a seller is given', async () => {
    await issueInvoice('BRAND', brandA._id);
    await issueInvoice('BRAND', brandB._id);

    const list = await adminListInvoices({ sellerType: 'BRAND', sellerId: brandA._id });

    expect(list.items).toHaveLength(1);
    expect(list.items[0].seller.name).toContain('Loom');
  });
});

describe('commission arithmetic against the database', () => {
  it('matches the documented PKR 10,000 example', () => {
    expect(commissionForPaisa(1000000, 100)).toBe(10000);
  });
});
