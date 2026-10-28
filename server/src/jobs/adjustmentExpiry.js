const { expireAdjustments } = require('../services/orderAdjustment.service');

/**
 * Expires order-change proposals that were not answered within 24 hours
 * (docs/21 §H.3). Nothing about the order changes: the substitute reservation
 * is released and the brand is told. It runs on a timer inside the server
 * process, and is safe to repeat or run on several servers: one conditional
 * update resolves each proposal.
 */
const EVERY_MS = 60 * 1000;

function startAdjustmentExpiryJob() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await expireAdjustments();
      if (expired > 0) {
        // eslint-disable-next-line no-console
        console.log(`[orders] expired ${expired} unanswered change proposal(s).`);
      }
    } catch (err) {
      console.error(`[orders] adjustment expiry check failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, EVERY_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}

module.exports = { startAdjustmentExpiryJob };
