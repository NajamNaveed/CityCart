const mongoose = require('mongoose');

/**
 * Runs `work(session)` inside a MongoDB transaction (docs/08 §24). Commits
 * if it resolves; aborts and rethrows if it throws. Transient errors
 * (write conflicts) are retried automatically by withTransaction, so `work`
 * must be safe to run more than once (it only touches the session).
 *
 * Requires a replica set / Atlas — a standalone mongod cannot run
 * transactions.
 */
async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
