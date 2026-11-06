const Brand = require('../models/brand.model');
const ServiceProvider = require('../models/serviceProvider.model');
const SellerInvoice = require('../models/sellerInvoice.model');

const {
  generateMonthlyInvoices,
  markOverdueInvoices,
  refreshSellerBillingState,
  getSellerBillingSummary,
} = require('../services/billing.service');
const { notifySellerBillingTransition } = require('../services/notification.service');
const { karachiParts, karachiDateKey } = require('../utils/karachiTime');

/**
 * Seller billing housekeeping (docs/15 §7–§9, docs/24 §5.4–§5.5):
 *
 *  - once a Karachi day, close the previous calendar month into invoices
 *    (00:05 is the documented moment; the guard also recovers a missed run);
 *  - mark unpaid invoices overdue;
 *  - re-derive the freeze ladder for every seller with an unpaid bill (or a
 *    non-active state) and notify the owner when the state changes.
 *
 * Every step is idempotent and overlapping ticks are skipped, so a second
 * server instance is harmless. Hot paths (checkout, booking creation) also
 * evaluate the ladder themselves, so a late tick can never let a restricted
 * seller take a new order.
 */
const EVERY_MS = 60 * 1000;
const LADDER_EVERY_MS = 15 * 60 * 1000;
const INVOICE_MINUTE_OF_DAY = 5; // 00:05 Karachi

async function sellersWithUnpaidInvoices() {
  return SellerInvoice.aggregate([
    {
      $match: {
        status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        amountDuePaisa: { $gt: 0 },
      },
    },
    { $group: { _id: { sellerType: '$sellerType', sellerId: '$sellerId' } } },
  ]);
}

async function sellersWithBillingState() {
  const [brands, providers] = await Promise.all([
    Brand.find({ billingStatus: { $in: ['WARNING', 'RESTRICTED', 'FROZEN'] } }).select('_id'),
    ServiceProvider.find({ billingStatus: { $in: ['WARNING', 'RESTRICTED', 'FROZEN'] } }).select('_id'),
  ]);
  return [
    ...brands.map((row) => ({ _id: { sellerType: 'BRAND', sellerId: row._id } })),
    ...providers.map((row) => ({ _id: { sellerType: 'SERVICE_PROVIDER', sellerId: row._id } })),
  ];
}

async function refreshLadder(now) {
  const [unpaid, nonActive] = await Promise.all([sellersWithUnpaidInvoices(), sellersWithBillingState()]);
  const seen = new Set();
  const targets = [];
  for (const row of [...unpaid, ...nonActive]) {
    const key = `${row._id.sellerType}:${row._id.sellerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(row._id);
  }

  for (const target of targets) {
    const state = await refreshSellerBillingState(target.sellerType, target.sellerId, { now });
    if (!state || !state.changed) continue;
    if (!['WARNING', 'RESTRICTED', 'FROZEN'].includes(state.status)) continue;

    const summary = await getSellerBillingSummary(target.sellerType, target.sellerId, { now });
    const oldest = summary.invoices[0] || null;
    await notifySellerBillingTransition({
      sellerType: target.sellerType,
      sellerId: target.sellerId,
      status: state.status,
      amountDuePaisa: summary.balancePaisa,
      invoiceId: oldest ? oldest._id : null,
    });
    // eslint-disable-next-line no-console
    console.log(`[billing] ${target.sellerType} ${target.sellerId} -> ${state.status}.`);
  }

  return targets.length;
}

function startBillingJobs() {
  let running = false;
  let lastInvoiceDay = '';
  let lastLadderAt = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const parts = karachiParts(now);
      const dayKey = karachiDateKey(now);

      if (
        dayKey !== lastInvoiceDay &&
        (parts.day > 1 || parts.minuteOfDay >= INVOICE_MINUTE_OF_DAY)
      ) {
        lastInvoiceDay = dayKey;
        const result = await generateMonthlyInvoices({ now });
        if (result.issued.length > 0 || result.skipped.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[billing] invoices for ${result.periodKey}: ${result.issued.length} issued, ${result.skipped.length} skipped.`
          );
        }
      }

      await markOverdueInvoices({ now });

      if (now.getTime() - lastLadderAt >= LADDER_EVERY_MS) {
        lastLadderAt = now.getTime();
        const refreshed = await refreshLadder(now);
        if (refreshed > 0) {
          // eslint-disable-next-line no-console
          console.log(`[billing] checked ${refreshed} seller(s) for the freeze ladder.`);
        }
      }
    } catch (err) {
      console.error(`[billing] housekeeping failed: ${err.message}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startBillingJobs, refreshLadder };
