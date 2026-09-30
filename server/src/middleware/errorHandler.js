const env = require('../config/env');

/**
 * 404 for any route no router handled. Mounted after all routers.
 */
function notFound(req, res) {
  return res.status(404).json({ success: false, message: 'Route not found.' });
}

/**
 * Global error handler (must be registered last, 4-arg signature).
 *
 * Keeps the { success: false, message } shape used everywhere else
 * (docs/06 §29) and never leaks stack traces or internals to clients in
 * production. Detailed errors are logged server-side only.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Malformed JSON body (thrown by express.json()).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Malformed JSON body.' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large.' });
  }

  // Invalid ObjectId reaching Mongoose (safety net behind route validators).
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid id.' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: 'Validation failed.' });
  }

  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate value.' });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: 'Internal server error.',
    ...(env.nodeEnv === 'development' && { detail: err.message }),
  });
}

module.exports = { notFound, errorHandler };
