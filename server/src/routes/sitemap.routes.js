const express = require('express');

const { sitemap, robots } = require('../controllers/sitemap.controller');

const router = express.Router();

// Crawler files live at the site root. Vercel rewrites /sitemap.xml and
// /robots.txt here so both are served from the public domain.
router.get('/sitemap.xml', sitemap);
router.get('/robots.txt', robots);

module.exports = router;
