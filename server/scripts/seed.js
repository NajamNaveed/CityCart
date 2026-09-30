/**
 * Dev seed: super admin, city, ACTIVE brand, brand admin, store.
 * Idempotent. Refuses to run in production.   Usage: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../src/models/user.model');
const City = require('../src/models/city.model');
const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const { hashPassword } = require('../src/utils/password');
const { ROLES } = require('../src/config/roles');

async function getOrCreate(Model, query, data) {
  const found = await Model.findOne(query);
  if (found) return { doc: found, created: false };
  return { doc: await Model.create(data), created: true };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set (server/.env).');
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const adminPw = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const brandPw = process.env.SEED_BRAND_PASSWORD || 'Brand@12345';
  const log = [];

  const city = await getOrCreate(City, { slug: 'faisalabad' }, {
    name: 'Faisalabad', slug: 'faisalabad', state: 'Punjab', country: 'Pakistan',
  });
  log.push(['city', city]);

  const brand = await getOrCreate(Brand, { slug: 'demo-brand' }, {
    name: 'Demo Brand', slug: 'demo-brand', cityId: city.doc._id,
    description: 'Seeded demo brand', status: 'ACTIVE',
  });
  log.push(['brand', brand]);

  const superAdmin = await getOrCreate(User, { email: 'admin@citycart.local' }, {
    name: 'Super Admin', email: 'admin@citycart.local',
    passwordHash: await hashPassword(adminPw), role: ROLES.SUPER_ADMIN,
  });
  log.push(['super admin', superAdmin]);

  const brandAdmin = await getOrCreate(User, { email: 'brand@citycart.local' }, {
    name: 'Demo Brand Admin', email: 'brand@citycart.local',
    passwordHash: await hashPassword(brandPw), role: ROLES.BRAND_ADMIN,
    brandId: brand.doc._id,
  });
  log.push(['brand admin', brandAdmin]);

  const store = await getOrCreate(Store, { brandId: brand.doc._id }, {
    brandId: brand.doc._id, name: 'Demo Store', slug: 'demo-store',
    description: 'Seeded demo store',
  });
  log.push(['store', store]);

  log.forEach(([n, r]) => console.log(`${r.created ? 'created' : 'exists '}  ${n}`));
  console.log('\nLogins:\n  admin@citycart.local / Admin@12345\n  brand@citycart.local / Brand@12345');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());