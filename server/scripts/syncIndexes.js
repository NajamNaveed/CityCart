/**
 * Brings the database indexes in line with the Mongoose schemas.
 *
 *   npm run sync-indexes
 *
 * Needed once after upgrading an EXISTING database: some indexes changed
 * from plain to UNIQUE (stores.slug, stores.brandId, employees.userId).
 * MongoDB refuses to change an index's options in place, so Mongoose keeps
 * the old non-unique one and uniqueness is NOT enforced until it is
 * rebuilt. syncIndexes() drops indexes that differ from the schema and
 * creates the missing ones. Safe for development data; for production,
 * check for duplicates first. Refuses to run in production.
 */
require('dotenv').config();
const mongoose = require('mongoose');

require('../src/models/user.model');
require('../src/models/city.model');
require('../src/models/brand.model');
require('../src/models/store.model');
require('../src/models/employee.model');
require('../src/models/category.model');
require('../src/models/product.model');
require('../src/models/inventory.model');
require('../src/models/cart.model');
require('../src/models/order.model');
require('../src/models/payment.model');
require('../src/models/delivery.model');
require('../src/models/counter.model');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run in production. Review duplicates and indexes manually.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set (server/.env).');
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  for (const name of mongoose.modelNames()) {
    try {
      const dropped = await mongoose.model(name).syncIndexes();
      console.log(`${name.padEnd(10)} ok${dropped.length ? `  (dropped: ${dropped.join(', ')})` : ''}`);
    } catch (err) {
      console.log(`${name.padEnd(10)} FAILED: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
