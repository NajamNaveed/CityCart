const express = require('express');

const controller = require('../controllers/chat.controller');
const authenticate = require('../middleware/authenticate');
const { chatAccess, customerOnly, mustBeAbleToReply } = require('../middleware/chatAccess');
const { chatSendLimiter, chatStartLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Every chat route needs a signed-in customer or brand team member.
router.use(authenticate, chatAccess);

router.get('/', controller.listChats);
router.get('/unread-count', controller.unread);
// Customer arriving from a product page. Must stay above '/:id/...'.
router.get('/product/:productId', customerOnly, controller.productContext);
router.post('/start', customerOnly, chatStartLimiter, controller.start);

router.get('/:id/messages', controller.messages);
router.post('/:id/messages', mustBeAbleToReply, chatSendLimiter, controller.send);
router.post('/:id/read', controller.read);

module.exports = router;
