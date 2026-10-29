const { purgeVerifiedProofs } = require('../services/paymentProof.service');

/**
 * Deletes payment-proof photos the brand has already checked, `retentionDays`
 * after the decision (docs/21 §I.4). Only the photo goes: the payment, its
 * reference and the decision stay. It runs on a timer inside the server process,
 * does nothing while Cloudinary is not set up, and is safe to repeat or to run on
 * several servers: a record is only forgotten once Cloudinary confirmed the delete.
 */
const EVERY_MS = 6 * 60 * 60 * 1000;

function startPaymentProofRetentionJob() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await purgeVerifiedProofs();
      if (deleted > 0) {
        // eslint-disable-next-line no-console
        console.log(`[payments] deleted ${deleted} checked payment proof photo(s).`);
      }
    } catch (err) {
      console.error(`[payments] proof retention check failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, EVERY_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}

module.exports = { startPaymentProofRetentionJob };
