const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const DATABASE_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

/**
 * GET /health
 *
 * Confirms the process is up and reports whether it can currently reach the
 * database, so a dashboard or a developer can tell "server down" apart from
 * "server up but database unreachable".
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'citycart-server',
    database: DATABASE_STATES[mongoose.connection.readyState] || 'unknown',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;