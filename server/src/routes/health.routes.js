const express = require('express');

const router = express.Router();

/**
 * GET /health
 *
 * Minimal foundation-level health check for Phase 0. Confirms the process is
 * up and can respond to HTTP requests. Does not check database connectivity
 * yet — that is introduced when MongoDB is wired up in a later phase.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'citycart-server',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
