const express = require('express');

const { list, markRead, markAllRead, remove } = require('../controllers/notification.controller');
const authenticate = require('../middleware/authenticate');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');

const router = express.Router();

/**
 * Notifications belong to exactly one user (docs/12 §3): every query in the
 * service is scoped by req.user._id, so authentication is the only gate —
 * customers, brand users and super admins all read the same personal inbox.
 * Brand isolation is enforced at SEND time by the audience resolution in
 * services/notification.service.js, not by tenant middleware here.
 */
router.use(authenticate);

router.get('/', list);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', validateObjectIdParam, markRead);
router.delete('/:id', validateObjectIdParam, remove);

module.exports = router;
