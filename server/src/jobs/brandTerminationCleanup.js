const { releaseDueTerminatedBrandIdentities } = require('../services/brandTermination.service');

/**
 * Frees the staff identities of terminated brands once their access window has
 * ended (docs/24 §3.7). Runs on a timer inside the server process and is safe
 * to repeat or to run on several servers: already anonymized rows are skipped.
 */
const EVERY_MS = 60 * 60 * 1000;

function startBrandTerminationCleanupJob() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { anonymized, membershipsRemoved } = await releaseDueTerminatedBrandIdentities();
      if (anonymized > 0 || membershipsRemoved > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[brands] released ${anonymized} terminated account(s), removed ${membershipsRemoved} membership(s).`
        );
      }
    } catch (err) {
      console.error(`[brands] termination cleanup failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startBrandTerminationCleanupJob };
