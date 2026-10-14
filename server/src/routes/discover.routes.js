const express = require('express');

const { search } = require('../controllers/discover.controller');

const router = express.Router();

// Public: shoppers find nearby brands and products without an account.
router.get('/', search);

module.exports = router;
