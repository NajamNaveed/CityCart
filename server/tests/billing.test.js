jest.mock('../src/models/brand.model');
jest.mock('../src/models/serviceProvider.model');
jest.mock('../src/models/commissionEntry.model');
jest.mock('../src/models/sellerInvoice.model');
jest.mock('../src/models/sellerPaymentClaim.model');
jest.mock('../src/models/billingHelp.model');
jest.mock('../src/models/platformSettings.model');
jest.mock('../src/services/notification.service');

const mongoose = require('mongoose');

const Brand = require('../src/models/brand.model');
const SellerInvoice = require('../src/models/sellerInvoice.model');
const CommissionEntry = require('../src/models/commissionEntry.model');
const SellerPaymentClaim = require('../src/models/sellerPaymentClaim.model');
const PlatformSettings = require('../src/models/platformSettings.model');
const {
  commissionForPaisa,
  refreshSellerBillingState,
  assertSellerCanSell,
  getSellerInvoice,
  createPaymentClaim,
} = require('../src/services/billing.service');
const requireSellerTenant = require('../src/middleware/requireSellerTenant');
const {
  claimSchema,
  helpSchema,
  adminClaimDecisionSchema,
  adminSellerParamSchema,
  freezeOverrideSchema,
  graceSchema,
  billingSettingsSchema,
} = require('../src/validators/billing.validator');

const oid = () => new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

function sellerModelReturns(seller) {
  Brand.findById.mockReturnValue({ select: () => ({ session: () => Promise.resolve(seller) }) });
}

// A minute into the Nth day overdue, so the exact threshold is not flaky.
function oldestInvoiceDue(daysOverdue, extraMs = 60 * 1000) {
  SellerInvoice.findOne.mockReturnValue({
    sort: () => ({
      session: () => Promise.resolve({ _id: oid(), dueAt: new Date(Date.now() - daysOverdue * DAY - extraMs) }),
    }),
  });
}
const overdueDays = oldestInvoiceDue;

beforeEach(() => {
  jest.resetAllMocks();
  Brand.updateOne.mockResolvedValue({});
  PlatformSettings.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
});

describe('1% commission arithmetic (docs/15 §3)', () => {
  it('takes 1% in paisa and rounds half-up', () => {
    expect(commissionForPaisa(123456, 100)).toBe(1235); // 1234.56 -> 1235
    expect(commissionForPaisa(1250, 100)).toBe(13); // 12.5 -> 13
    expect(commissionForPaisa(1234, 100)).toBe(12); // 12.34 -> 12
    expect(commissionForPaisa(1_000_000, 100)).toBe(10000); // PKR 10,000 -> PKR 100
  });

  it('charges nothing for a zero, negative or non-integer base', () => {
    expect(commissionForPaisa(0, 100)).toBe(0);
    expect(commissionForPaisa(-500, 100)).toBe(0);
    expect(commissionForPaisa(19.99, 100)).toBe(0);
  });

  it('charges nothing when the rate is zero', () => {
    expect(commissionForPaisa(1000000, 0)).toBe(0);
  });

  it('scales with the stored rate', () => {
    expect(commissionForPaisa(1_000_000, 250)).toBe(25000);
  });
});

describe('freeze ladder (docs/15 §9)', () => {
  const brandId = oid();
  const active = { _id: brandId, billingStatus: 'ACTIVE', billingGraceUntil: null, billingOverride: null };

  it('is ACTIVE with no unpaid invoice', async () => {
    sellerModelReturns({ ...active });
    SellerInvoice.findOne.mockReturnValue({ sort: () => ({ session: () => Promise.resolve(null) }) });

    const state = await refreshSellerBillingState('BRAND', brandId);

    expect(state).toMatchObject({ status: 'ACTIVE', previous: 'ACTIVE', changed: false });
    expect(Brand.updateOne).toHaveBeenCalledWith(
      { _id: brandId },
      { $set: expect.objectContaining({ billingStatus: 'ACTIVE' }) },
      expect.anything()
    );
  });

  it('is WARNING the day after the due date', async () => {
    sellerModelReturns({ ...active });
    oldestInvoiceDue(1);

    expect((await refreshSellerBillingState('BRAND', brandId)).status).toBe('WARNING');
  });

  it('is RESTRICTED from 7 days past due', async () => {
    sellerModelReturns({ ...active });
    overdueDays(7);

    expect((await refreshSellerBillingState('BRAND', brandId)).status).toBe('RESTRICTED');
  });

  it('is FROZEN from 14 days past due', async () => {
    sellerModelReturns({ ...active });
    overdueDays(14);

    expect((await refreshSellerBillingState('BRAND', brandId)).status).toBe('FROZEN');
  });

  it('reports a change so the job knows to notify the seller', async () => {
    sellerModelReturns({ ...active });
    oldestInvoiceDue(10);

    const state = await refreshSellerBillingState('BRAND', brandId);

    expect(state).toMatchObject({ status: 'RESTRICTED', previous: 'ACTIVE', changed: true });
  });

  it('an active manual override wins over the invoice date', async () => {
    sellerModelReturns({
      ...active,
      billingStatus: 'FROZEN',
      billingOverride: { status: 'ACTIVE', reason: 'Verified payment by hand.', until: new Date(Date.now() + DAY) },
    });

    const state = await refreshSellerBillingState('BRAND', brandId);

    expect(state).toMatchObject({ status: 'ACTIVE', previous: 'FROZEN', changed: true });
    expect(SellerInvoice.findOne).not.toHaveBeenCalled();
  });

  it('an expired override no longer applies', async () => {
    sellerModelReturns({
      ...active,
      billingOverride: { status: 'ACTIVE', reason: 'Temporary.', until: new Date(Date.now() - DAY) },
    });
    oldestInvoiceDue(10);

    expect((await refreshSellerBillingState('BRAND', brandId)).status).toBe('RESTRICTED');
  });

  it('a grace period keeps the seller ACTIVE without reading invoices', async () => {
    sellerModelReturns({ ...active, billingGraceUntil: new Date(Date.now() + 3 * DAY) });

    const state = await refreshSellerBillingState('BRAND', brandId);

    expect(state.status).toBe('ACTIVE');
    expect(SellerInvoice.findOne).not.toHaveBeenCalled();
  });

  it('an expired grace period falls back to the invoice state', async () => {
    sellerModelReturns({ ...active, billingGraceUntil: new Date(Date.now() - DAY) });
    oldestInvoiceDue(15);

    expect((await refreshSellerBillingState('BRAND', brandId)).status).toBe('FROZEN');
  });

  it('returns null for a seller that no longer exists (no write)', async () => {
    sellerModelReturns(null);

    expect(await refreshSellerBillingState('BRAND', brandId)).toBeNull();
    expect(Brand.updateOne).not.toHaveBeenCalled();
  });

  it('rejects an unknown seller type', async () => {
    await expect(refreshSellerBillingState('SHOP', oid())).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_SELLER_TYPE',
    });
  });

  it('blocks new sales from RESTRICTED and FROZEN, but not WARNING', async () => {
    sellerModelReturns({ ...active });
    oldestInvoiceDue(2);
    await expect(assertSellerCanSell('BRAND', brandId)).resolves.toMatchObject({ status: 'WARNING' });

    oldestInvoiceDue(10);
    await expect(assertSellerCanSell('BRAND', brandId)).rejects.toMatchObject({
      status: 409,
      code: 'SELLER_BILLING_RESTRICTED',
      extra: { billingStatus: 'RESTRICTED' },
    });

    oldestInvoiceDue(15);
    await expect(assertSellerCanSell('BRAND', brandId)).rejects.toMatchObject({
      status: 409,
      code: 'SELLER_BILLING_RESTRICTED',
    });
  });
});

describe('requireSellerTenant (docs/24 §5.1)', () => {
  const run = (req) => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    let nexted = false;
    requireSellerTenant(req, res, () => {
      nexted = true;
    });
    return { res, nexted };
  };

  it('maps a brand admin to its own brand', () => {
    const brandId = oid();
    const req = { user: { role: 'BRAND_ADMIN', brandId } };
    const { res, nexted } = run(req);

    expect(nexted).toBe(true);
    expect(req.seller).toEqual({ type: 'BRAND', id: String(brandId) });
    expect(res.statusCode).toBeNull();
  });

  it('maps a service provider to its provider row', () => {
    const provider = { _id: oid() };
    const req = { user: { role: 'SERVICE_PROVIDER' }, provider };
    const { nexted } = run(req);

    expect(nexted).toBe(true);
    expect(req.seller).toEqual({ type: 'SERVICE_PROVIDER', id: provider._id });
  });

  it.each(['CUSTOMER', 'BRAND_EMPLOYEE', 'PICKER', 'RIDER', 'SUPER_ADMIN'])('403 for %s', (role) => {
    const { res, nexted } = run({ user: { role, brandId: oid() } });

    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('403 for a brand admin whose session has no brand', () => {
    const { res, nexted } = run({ user: { role: 'BRAND_ADMIN' } });

    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('401 without a session', () => {
    const { res } = run({});

    expect(res.statusCode).toBe(401);
  });

  it('never trusts a brand id sent in the query or body', () => {
    const ownBrand = oid();
    const req = {
      user: { role: 'BRAND_ADMIN', brandId: ownBrand },
      query: { brandId: String(oid()) },
      body: { sellerId: String(oid()) },
    };
    run(req);

    expect(req.seller.id).toBe(String(ownBrand));
  });
});

describe('billing validators', () => {
  it('accepts a claim with whole paisa and a known method', () => {
    const parsed = claimSchema.parse({
      amountPaisa: 125000,
      method: 'BANK_TRANSFER',
      reference: 'MCB-1234',
      receipt: { publicId: 'citycart/billing/receipt', fingerprint: 'abc' },
      comment: 'Paid in full.',
    });

    expect(parsed.amountPaisa).toBe(125000);
  });

  it('rejects fractional paisa, unknown methods and extra fields', () => {
    expect(claimSchema.safeParse({ amountPaisa: 12.5, method: 'BANK_TRANSFER', reference: 'MCB-1234' }).success).toBe(false);
    expect(claimSchema.safeParse({ amountPaisa: 100, method: 'CARD', reference: 'MCB-1234' }).success).toBe(false);
    expect(
      claimSchema.safeParse({ amountPaisa: 100, method: 'JAZZCASH', reference: 'JC-1', sellerId: 'x' }).success
    ).toBe(false);
  });

  it('requires a subject and a message for billing help', () => {
    expect(helpSchema.safeParse({ subject: 'Bank', message: 'Help me' }).success).toBe(true);
    expect(helpSchema.safeParse({ subject: '', message: 'Help me' }).success).toBe(false);
    expect(helpSchema.safeParse({ subject: 'Question', message: '' }).success).toBe(false);
  });

  it('requires a reason when a claim is rejected', () => {
    expect(adminClaimDecisionSchema.safeParse({ decision: 'VERIFIED' }).success).toBe(true);
    expect(adminClaimDecisionSchema.safeParse({ decision: 'REJECTED' }).success).toBe(false);
    expect(adminClaimDecisionSchema.safeParse({ decision: 'REJECTED', note: 'No' }).success).toBe(false);
    expect(adminClaimDecisionSchema.safeParse({ decision: 'REJECTED', note: 'Reference not found.' }).success).toBe(true);
  });

  it('checks the seller type on admin seller routes', () => {
    expect(adminSellerParamSchema.safeParse({ type: 'BRAND', id: String(oid()) }).success).toBe(true);
    expect(adminSellerParamSchema.safeParse({ type: 'SHOP', id: String(oid()) }).success).toBe(false);
    expect(adminSellerParamSchema.safeParse({ type: 'BRAND', id: 'nope' }).success).toBe(false);
  });

  it('requires a reason for every freeze override and grace grant', () => {
    expect(freezeOverrideSchema.safeParse({ status: 'ACTIVE', reason: 'Paid in cash.' }).success).toBe(true);
    expect(freezeOverrideSchema.safeParse({ status: 'ACTIVE', reason: '' }).success).toBe(false);
    expect(freezeOverrideSchema.safeParse({ status: 'OPEN', reason: 'Paid in cash.' }).success).toBe(false);
    expect(graceSchema.safeParse({ until: '2026-12-01', reason: 'Bank delay.' }).success).toBe(true);
    expect(graceSchema.safeParse({ until: 'not a date', reason: 'Bank delay.' }).success).toBe(false);
  });

  it('refuses billing settings where the freeze step is earlier than restriction', () => {
    expect(billingSettingsSchema.safeParse({ freezeAfterDays: 7, restrictAfterDays: 7 }).success).toBe(true);
    expect(billingSettingsSchema.safeParse({ freezeAfterDays: 5, restrictAfterDays: 7 }).success).toBe(false);
    expect(billingSettingsSchema.safeParse({}).success).toBe(false);
    expect(billingSettingsSchema.safeParse({ rateBps: 10001 }).success).toBe(false);
  });
});

describe('seller-scoped billing access (IDOR)', () => {
  it('loads an invoice only inside the caller\'s seller scope', async () => {
    const sellerId = oid();
    const invoiceId = oid();
    SellerInvoice.findOne.mockResolvedValue(null);

    await expect(getSellerInvoice('BRAND', sellerId, invoiceId)).rejects.toMatchObject({ status: 404 });
    expect(SellerInvoice.findOne).toHaveBeenCalledWith({ _id: invoiceId, sellerType: 'BRAND', sellerId });
  });

  it('cannot claim against another seller\'s invoice', async () => {
    SellerInvoice.findOne.mockResolvedValue(null);

    await expect(
      createPaymentClaim({
        sellerType: 'BRAND',
        sellerId: oid(),
        invoiceId: oid(),
        data: { amountPaisa: 100 },
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a receipt uploaded into another seller\'s folder', async () => {
    const sellerId = oid();
    SellerInvoice.findOne.mockResolvedValue({ _id: oid(), status: 'ISSUED', amountDuePaisa: 1000 });

    await expect(
      createPaymentClaim({
        sellerType: 'BRAND',
        sellerId,
        invoiceId: oid(),
        data: {
          amountPaisa: 100,
          receipt: { publicId: `citycart/billing/brands/${oid()}/receipts/x`, fingerprint: 'abc' },
        },
      })
    ).rejects.toMatchObject({ status: 422, code: 'RECEIPT_NOT_YOURS' });
  });

  it('refuses a receipt path that tries to climb out of the folder', async () => {
    const sellerId = oid();
    SellerInvoice.findOne.mockResolvedValue({ _id: oid(), status: 'ISSUED', amountDuePaisa: 1000 });

    await expect(
      createPaymentClaim({
        sellerType: 'BRAND',
        sellerId,
        invoiceId: oid(),
        data: {
          amountPaisa: 100,
          receipt: { publicId: `citycart/billing/brands/${sellerId}/receipts/../../other/x`, fingerprint: 'abc' },
        },
      })
    ).rejects.toMatchObject({ code: 'RECEIPT_NOT_YOURS' });
  });
});
