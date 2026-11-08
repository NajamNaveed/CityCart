const express = require('express');

const { getPublicSettings } = require('../controllers/publicSettings.controller');

const router = express.Router();

// Public: used by the Help and Contact pages for the current support address.
router.get('/public', getPublicSettings);

module.exports = router;
