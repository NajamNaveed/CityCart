const env = require('../config/env');

/**
 * Minimal request logger (no new dependency): "METHOD /path STATUS ms".
 * Logs the path only — never the query string or body, which can carry
 * passwords or tokens. Silent under test.
 */
function requestLogger(req, res, next) {
  if (env.nodeEnv === 'test') {
    return next();
  }
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  return next();
}

module.exports = requestLogger;
