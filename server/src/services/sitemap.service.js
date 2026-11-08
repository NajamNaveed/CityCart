const env = require('../config/env');
const Brand = require('../models/brand.model');
const Product = require('../models/product.model');
const ServiceProvider = require('../models/serviceProvider.model');

// Public, indexable pages. Private areas are listed in robots.js instead.
const STATIC_PATHS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/nearby', changefreq: 'daily', priority: '0.9' },
  { path: '/services', changefreq: 'daily', priority: '0.9' },
  { path: '/brands', changefreq: 'weekly', priority: '0.6' },
  { path: '/sell', changefreq: 'monthly', priority: '0.6' },
  { path: '/help', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.4' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/seller-agreement', changefreq: 'yearly', priority: '0.3' },
  { path: '/provider-agreement', changefreq: 'yearly', priority: '0.3' },
];

function clientOrigin() {
  const configured = String(env.clientUrl || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return configured || 'http://localhost:5173';
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lastmodOf(document) {
  const date = document && document.updatedAt;
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function urlEntry(origin, path, { changefreq, priority, lastmod } = {}) {
  const parts = [`    <loc>${escapeXml(`${origin}${path}`)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

// Mirrors the public read rules: only ACTIVE brands, ACTIVE products that are
// on sale inside an ACTIVE brand, and verified providers that are not frozen.
async function collectDynamicPaths() {
  const brands = await Brand.find({ status: 'ACTIVE' }, '_id updatedAt');
  const brandIds = brands.map((brand) => brand._id);

  const [products, providers] = await Promise.all([
    brandIds.length
      ? Product.find(
          { brandId: { $in: brandIds }, status: 'ACTIVE', isActive: true },
          '_id updatedAt'
        )
      : [],
    ServiceProvider.find(
      { status: 'ACTIVE', verification: 'VERIFIED', billingStatus: { $ne: 'FROZEN' } },
      'slug updatedAt'
    ),
  ]);

  return { brands, products, providers };
}

async function buildSitemap() {
  const origin = clientOrigin();
  const { brands, products, providers } = await collectDynamicPaths();

  const entries = [
    ...STATIC_PATHS.map((entry) => urlEntry(origin, entry.path, entry)),
    ...brands.map((brand) =>
      urlEntry(origin, `/store/${brand._id}`, {
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: lastmodOf(brand),
      })
    ),
    ...products.map((product) =>
      urlEntry(origin, `/product/${product._id}`, {
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: lastmodOf(product),
      })
    ),
    ...providers.map((provider) =>
      urlEntry(origin, `/services/${encodeURIComponent(provider.slug)}`, {
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: lastmodOf(provider),
      })
    ),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

// Private areas: personal, account-only or staff screens. They also render
// `noindex`, but keeping crawlers out saves the crawl budget.
const DISALLOWED_PREFIXES = [
  '/admin',
  '/brand',
  '/provider',
  '/cart',
  '/checkout',
  '/orders',
  '/bookings',
  '/addresses',
  '/chat',
  '/notifications',
  '/order-placed',
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/sell/login',
  '/sell/apply',
  '/sell/service',
  '/design',
];

function buildRobots() {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    '',
    `Sitemap: ${clientOrigin()}/sitemap.xml`,
    '',
  ].join('\n');
}

module.exports = { buildSitemap, buildRobots, clientOrigin, STATIC_PATHS };
