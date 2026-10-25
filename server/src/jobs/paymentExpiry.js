const { expireUnpaidOnlinePayments } = require('../services/onlinePayment.service');
const { activeProvider } = require('../payments');

/**
 * Releases the stock of online orders that were not paid in time (docs/10 §29). It runs
 * on a timer inside the server process, so it needs no extra package or service. It is
 * safe to run on several servers at once and to repeat: every order is cancelled by one
 * atomic conditional update, so stock can never be returned twice.
 */
const EVERY_MS = 60 * 1000;

function startPaymentExpiryJob() {
  let running = false;
  const tick = async () => {
    if (running || !activeProvider()) return; // nothing to expire while online payments are off
    running = true;
    try {
      const cancelled = await expireUnpaidOnlinePayments();
      if (cancelled > 0) {
        // eslint-disable-next-line no-console
        console.log(`[payments] cancelled ${cancelled} unpaid online order(s) and returned their stock.`);
      }
    } catch (err) {
      console.error(`[payments] expiry check failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, EVERY_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}

module.exports = { startPaymentExpiryJob };
