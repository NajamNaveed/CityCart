/**
 * Fills an EMPTY database with a realistic demo marketplace: cities, brands in every status,
 * owners, staff, categories, products, stock, customers, carts, orders in every state, payments,
 * refunds, deliveries, reviews and notifications. Every field of every model gets data.
 *
 *   npm run seed:demo                 only runs on an empty database
 *   npm run seed:demo -- --reset      wipes the database first (development only)
 *
 * Product photos are links (picsum.photos by default; SEED_IMAGES=keyword picks photos by
 * keyword instead). Refuses to run when NODE_ENV=production.
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

const { hashPassword } = require('../src/utils/password');
const { buildDataset } = require('./demo/build');

const MODELS = {
  cities: require('../src/models/city.model'),
  users: require('../src/models/user.model'),
  brands: require('../src/models/brand.model'),
  stores: require('../src/models/store.model'),
  categories: require('../src/models/category.model'),
  products: require('../src/models/product.model'),
  inventories: require('../src/models/inventory.model'),
  employees: require('../src/models/employee.model'),
  carts: require('../src/models/cart.model'),
  orders: require('../src/models/order.model'),
  payments: require('../src/models/payment.model'),
  deliveries: require('../src/models/delivery.model'),
  reviews: require('../src/models/review.model'),
  notifications: require('../src/models/notification.model'),
  counters: require('../src/models/counter.model'),
};

const PASSWORDS = {
  admin: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  brand: process.env.SEED_BRAND_PASSWORD || 'Brand@12345',
  demo: process.env.SEED_DEMO_PASSWORD || 'Demo@12345',
};

function describeFailure(err) {
  const { describeConnectionError } = require('../src/config/db');
  return describeConnectionError(err);
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (server/.env).');

  const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) dns.setServers(dnsServers);

  console.log('Connecting to the database...');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const dbName = mongoose.connection.name;

  const existing = (await Promise.all(Object.values(MODELS).map((m) => m.estimatedDocumentCount()))).reduce((a, b) => a + b, 0);
  if (existing > 0) {
    if (!process.argv.includes('--reset')) {
      throw new Error(
        `The database "${dbName}" is not empty (${existing} documents). Use a fresh database, or run "npm run seed:demo -- --reset" to wipe "${dbName}" first.`
      );
    }
    console.log(`Wiping database "${dbName}" (--reset)...`);
    await mongoose.connection.dropDatabase();
  }

  console.log('Preparing data (hashing 3 passwords)...');
  const hashes = {};
  for (const [key, value] of Object.entries(PASSWORDS)) hashes[key] = await hashPassword(value);
  const dataset = buildDataset({ now: new Date(), hashes });

  // Build the collections' indexes first, so the unique rules exist before any data does.
  await Promise.all(Object.values(MODELS).map((m) => m.createIndexes()));

  // Every document goes through its real schema first (validation + defaults), then is
  // inserted as-is so the realistic created/updated dates are kept exactly.
  for (const [name, Model] of Object.entries(MODELS)) {
    const docs = dataset[name].map((raw) => {
      const doc = new Model(raw);
      const problem = doc.validateSync();
      if (problem) throw new Error(`Invalid ${name} document (${raw.name || raw.orderNumber || raw._id}): ${problem.message}`);
      return { ...doc.toObject({ virtuals: false, getters: false, versionKey: false }), __v: 0 };
    });
    await Model.collection.insertMany(docs);
    console.log(`  ${name.padEnd(14)} ${String(docs.length).padStart(4)}`);
  }

  console.log(`
Done. Everything is in "${dbName}".

Sign in (passwords are the same on every account in a group):
  Super admin  /admin/login   admin@citycart.local            ${PASSWORDS.admin}
  Brand owner  /sell/login    brand@citycart.local            ${PASSWORDS.brand}   (Loom & Co., the fullest account)
  Other owners /sell/login    hamza.sheikh@citycart.demo and the rest   ${PASSWORDS.demo}
  Staff        /sell/login    usman.tariq@citycart.demo (orders) / fatima.noor@citycart.demo (catalogue)   ${PASSWORDS.demo}
  Customers    /login         sana.iqbal@citycart.demo and the rest      ${PASSWORDS.demo}
`);
}

main()
  .catch((err) => {
    console.error(`\nSeed failed: ${err.message}`);
    const hint = describeFailure(err);
    if (hint) console.error(`What to do: ${hint}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());