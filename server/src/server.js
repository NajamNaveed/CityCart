const http = require('http');

const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB, describeConnectionError } = require('./config/db');
const { initSockets, closeSockets } = require('./sockets');
const { startAdjustmentExpiryJob } = require('./jobs/adjustmentExpiry');
const { startPaymentProofRetentionJob } = require('./jobs/paymentProofRetention');
const { startBrandTerminationCleanupJob } = require('./jobs/brandTerminationCleanup');
const { startServiceBookingJobs } = require('./jobs/serviceBookingJobs');
const { startBillingJobs } = require('./jobs/billingJobs');

let httpServer;
let stopAdjustmentExpiryJob;
let stopPaymentProofRetentionJob;
let stopBrandTerminationCleanupJob;
let stopServiceBookingJobs;
let stopBillingJobs;

/**
 * Startup order matters: the database connection must succeed before the
 * HTTP server starts accepting requests (see
 * docs/18-development-roadmap.md, Phase 1). If the connection fails, the
 * process exits without ever calling app.listen().
 */
async function start() {
  try {
    await connectDB();
    // eslint-disable-next-line no-console
    console.log('MongoDB connected.');
  } catch (err) {
    console.error('Failed to connect to MongoDB. Server will not start.');
    console.error(err.message);
    const hint = describeConnectionError(err);
    if (hint) {
      console.error(`\nWhat to do: ${hint}`);
    }
    process.exitCode = 1;
    return;
  }

  // Socket.IO shares the HTTP server (docs/12 §13): same port, same CORS
  // policy, cookie-authenticated handshakes (see src/sockets/index.js).
  httpServer = http.createServer(app);
  initSockets(httpServer);
  // Unanswered change proposals expire after 24 hours (docs/21 §H).
  stopAdjustmentExpiryJob = startAdjustmentExpiryJob();
  // Checked payment-proof photos are deleted after their retention window (docs/21 §I.4).
  stopPaymentProofRetentionJob = startPaymentProofRetentionJob();
  // Terminated brands release their staff emails once access has ended (docs/24 §3.7).
  stopBrandTerminationCleanupJob = startBrandTerminationCleanupJob();
  // Service proposals expire, completed jobs auto-confirm and ranking refreshes (docs/24 §4.4).
  stopServiceBookingJobs = startServiceBookingJobs();
  // Monthly invoices, overdue marking and the seller freeze ladder (docs/15 §7-§9).
  stopBillingJobs = startBillingJobs();
  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `CityCart server running in ${env.nodeEnv} mode on http://localhost:${env.port}`
    );
  });
}

/**
 * Closes the HTTP server (letting in-flight requests finish) and then the
 * MongoDB connection, with a bounded timeout so shutdown can't hang
 * forever if either close call never resolves.
 */
async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    if (stopAdjustmentExpiryJob) stopAdjustmentExpiryJob();
    if (stopPaymentProofRetentionJob) stopPaymentProofRetentionJob();
    if (stopBrandTerminationCleanupJob) stopBrandTerminationCleanupJob();
    if (stopServiceBookingJobs) stopServiceBookingJobs();
    if (stopBillingJobs) stopBillingJobs();
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    }

    // Drops every connected socket client. Resolves even if the server was
    // already closed above.
    await closeSockets();

    await disconnectDB();

    clearTimeout(forceExitTimer);
    // eslint-disable-next-line no-console
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();