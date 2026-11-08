const { buildSitemap, buildRobots } = require('../services/sitemap.service');

async function sitemap(req, res, next) {
  try {
    const xml = await buildSitemap();
    return res.status(200).type('application/xml').send(xml);
  } catch (err) {
    return next(err);
  }
}

function robots(req, res) {
  return res.status(200).type('text/plain').send(buildRobots());
}

module.exports = { sitemap, robots };
