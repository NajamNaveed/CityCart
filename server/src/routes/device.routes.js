const express = require('express');

const { register, unregister } = require('../controllers/device.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { STAFF_APP_ROLES, DELIVERY_APP_ROLES } = require('../config/roles');

const router = express.Router();

// A phone running the Staff or Delivery app (brand team members, pickers and riders) tells the server
// where to send push notifications, and takes itself off when the person signs out. Only for the
// signed-in user.
router.use(authenticate, requireRole(...STAFF_APP_ROLES, ...DELIVERY_APP_ROLES));

router.put('/push-token', register);
router.delete('/push-token', unregister);

module.exports = router;
