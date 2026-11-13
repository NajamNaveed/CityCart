const express = require('express');

const { ping } = require('../controllers/ai.controller');
const authenticate = require('../middleware/authenticate');
const { requireAiEnabled, aiDailyLimit } = require('../middleware/aiAccess');
const { aiUserLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Signed-in first, then the kill switch, then the per-user burst cap, then the
// daily allowance (docs/29 Phase 0c). Later agent routes reuse this chain and
// append their own role checks.
router.post('/ping', authenticate, requireAiEnabled, aiUserLimiter, aiDailyLimit, ping);

module.exports = router;
