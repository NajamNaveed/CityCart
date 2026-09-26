const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

let httpServer;

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
    process.exitCode = 1;
    return;
  }

  httpServer = app.listen(env.port, () => {
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
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    }

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