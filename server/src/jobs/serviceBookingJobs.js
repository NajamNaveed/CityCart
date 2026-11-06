const { expireProposals, autoConfirmCompleted } = require('../services/serviceBooking.service');
const { recomputeAllRankings } = require('../services/serviceRanking.service');
const { karachiDateKey, karachiParts } = require('../utils/karachiTime');

/**
 * Service-booking housekeeping (docs/24 §4.4–§4.7):
 *
 *  - unanswered proposals expire (one conditional update, safe to repeat);
 *  - completed jobs are auto-confirmed 3 days after the provider finished;
 *  - ranking is recomputed once a day because time alone moves the 90-day
 *    window even when no event happened.
 *
 * Runs on a timer inside the server process. Every step is idempotent and
 * guarded against overlapping ticks, so a second instance is harmless.
 */
const EVERY_MS = 60 * 1000;
const RANKING_HOUR = 3; // 03:00 Karachi, after the overnight quiet period

function startServiceBookingJobs() {
  let running = false;
  let lastRankingKey = '';

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await expireProposals();
      if (expired > 0) {
        // eslint-disable-next-line no-console
        console.log(`[services] expired ${expired} unanswered proposal(s).`);
      }
      const confirmed = await autoConfirmCompleted();
      if (confirmed > 0) {
        // eslint-disable-next-line no-console
        console.log(`[services] auto-confirmed ${confirmed} completed booking(s).`);
      }

      const now = new Date();
      const key = karachiDateKey(now);
      if (key !== lastRankingKey && karachiParts(now).hour >= RANKING_HOUR) {
        lastRankingKey = key;
        const updated = await recomputeAllRankings({ now });
        // eslint-disable-next-line no-console
        console.log(`[services] refreshed ranking for ${updated} provider(s).`);
      }
    } catch (err) {
      console.error(`[services] booking housekeeping failed: ${err.message}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startServiceBookingJobs };
