const express = require('express');

const { register, unregister } = require('../controllers/device.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { PARTNER_ROLES } = require('../config/roles');

const router = express.Router();

// A phone running the Partner app (riders and brand team members) tells the server where to send
// push notifications, and takes itself off when the person signs out. Only for the signed-in user.
router.use(authenticate, requireRole(...PARTNER_ROLES));

router.put('/push-token', register);
router.delete('/push-token', unregister);

module.exports = router;
