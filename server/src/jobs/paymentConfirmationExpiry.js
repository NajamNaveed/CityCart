const { expirePendingConfirmations } = require('../services/paymentProof.service');

/**
 * Fails non-cash door payments whose confirmation window closed without a
 * decision (docs/10 §31.3). Each attempt is resolved by one conditional update,
 * so this is safe to repeat or to run on several servers.
 */
const EVERY_MS = 15 * 1000;

function startPaymentConfirmationExpiryJob() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await expirePendingConfirmations();
      if (expired > 0) {
        // eslint-disable-next-line no-console
        console.log(`[payments] expired ${expired} unconfirmed payment(s).`);
      }
    } catch (err) {
      console.error(`[payments] payment confirmation expiry check failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, EVERY_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}

module.exports = { startPaymentConfirmationExpiryJob };
