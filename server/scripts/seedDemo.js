/**
 * Fills an EMPTY database with a realistic demo marketplace: cities, brands in every status,
 * owners, staff, categories, products, stock, customers, carts, orders in every state, payments,
 * refunds, deliveries, reviews and notifications. Every field of every model gets data.
 *
 *   npm run seed:demo                 only runs on an empty database
 *   npm run seed:demo -- --reset      wipes the database first (development only)
 *
 * Product photos: a listing that names a `folder` gets the real photography under
 * Images/<folder>, uploaded to Cloudinary first (set CLOUDINARY_* in server/.env; URLs are
 * cached in demo/.image-cache.json so seeding twice does not upload twice). Everything else
 * is a link — picsum.photos by default, SEED_IMAGES=keyword picks photos by keyword instead.
 * Refuses to run when NODE_ENV=production.
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

const { hashPassword } = require('../src/utils/password');
const { buildDataset } = require('./demo/build');
const DEMO = require('./demo/catalog');
const { planImages, collectImageUrls } = require('./demo/uploadImages');

const MODELS = {
  cities: require('../src/models/city.model'),
  blocks: require('../src/models/block.model'),
  branches: require('../src/models/branch.model'),
  conversations: require('../src/models/conversation.model'),
  messages: require('../src/models/message.model'),
  users: require('../src/models/user.model'),
  brands: require('../src/models/brand.model'),
  stores: require('../src/models/store.model'),
  categories: require('../src/models/category.model'),
  catalogProducts: require('../src/models/catalogProduct.model'),
  addresses: require('../src/models/address.model'),
  products: require('../src/models/product.model'),
  inventories: require('../src/models/inventory.model'),
  employees: require('../src/models/employee.model'),
  carts: require('../src/models/cart.model'),
  orders: require('../src/models/order.model'),
  orderAdjustments: require('../src/models/orderAdjustment.model'),
  inventoryMovements: require('../src/models/inventoryMovement.model'),
  payments: require('../src/models/payment.model'),
  receipts: require('../src/models/receipt.model'),
  deliveries: require('../src/models/delivery.model'),
  returns: require('../src/models/return.model'),
  reviews: require('../src/models/review.model'),
  serviceCategories: require('../src/models/serviceCategory.model'),
  serviceProviders: require('../src/models/serviceProvider.model'),
  serviceOfferings: require('../src/models/serviceOffering.model'),
  serviceAvailabilities: require('../src/models/serviceAvailability.model'),
  serviceBookings: require('../src/models/serviceBooking.model'),
  serviceConversations: require('../src/models/serviceConversation.model'),
  serviceMessages: require('../src/models/serviceMessage.model'),
  serviceReviews: require('../src/models/serviceReview.model'),
  notifications: require('../src/models/notification.model'),
  counters: require('../src/models/counter.model'),
  commissionEntries: require('../src/models/commissionEntry.model'),
  sellerInvoices: require('../src/models/sellerInvoice.model'),
  sellerPaymentClaims: require('../src/models/sellerPaymentClaim.model'),
  billingHelpRequests: require('../src/models/billingHelp.model'),
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

/**
 * The photographs the catalog asks for, as { folder: [url, ...] }. Missing photos, a missing
 * Images/ folder, an unconfigured Cloudinary or a rejected upload each only cost the real
 * picture: the listing keeps its placeholder link and the seed goes on, because a demo store
 * is worth more than a broken upload.
 */
async function collectPhotos() {
  const requested = [...new Set(DEMO.BRANDS.flatMap((b) => b.products.map((p) => p.folder).filter(Boolean)))];
  const imageUrls = {};
  const plan = process.env.SEED_IMAGES
    ? { ready: false, missing: [], reason: `SEED_IMAGES=${process.env.SEED_IMAGES} asks for links instead of uploads` }
    : planImages({ requested });
  if ((plan.missing || []).length) {
    console.log(`Photos: Images/ has no folder for ${plan.missing.join(', ')}; those listings keep placeholder links.`);
  }
  if (!plan.ready) {
    console.log(`Photos: ${plan.reason}; every listing keeps a placeholder link.`);
    return imageUrls;
  }
  console.log(`Photos: ${plan.reason} to upload...`);
  try {
    Object.assign(imageUrls, await collectImageUrls({ requested }));
  } catch (err) {
    console.log(`Photos: the upload failed (${err.message}); every listing keeps a placeholder link.`);
  }
  return imageUrls;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (server/.env).');

  const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) dns.setServers(dnsServers);

  console.log('Connecting to the database...');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const dbName = mongoose.connection.name;

  // Photos are uploaded before anything is wiped, so a rejected upload cannot leave an
  // empty database behind.
  const imageUrls = await collectPhotos();

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
  const dataset = buildDataset({ now: new Date(), hashes, data: { ...DEMO, imageUrls } });

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

  // The single platform settings row: contact details and the bank account
  // sellers transfer their 1% bill to (docs/15 §7).
  const PlatformSettings = require('../src/models/platformSettings.model');
  await PlatformSettings.updateOne(
    { key: 'platform' },
    {
      $setOnInsert: {
        key: 'platform',
        platformName: 'CityCart',
        supportEmail: 'support@citycart.local',
        supportPhone: '+92 300 0000000',
        billing: {
          rateBps: 100,
          dueDays: 7,
          restrictAfterDays: 7,
          freezeAfterDays: 14,
          minimumInvoicePaisa: 10000,
          bank: {
            bankName: 'Meezan Bank',
            accountTitle: 'CityCart Technologies (Pvt) Ltd',
            accountNumber: '0101-0103456789',
            iban: 'PK36MEZN0001010103456789',
            instructions: 'Send the exact invoice amount, then submit the claim with the transfer reference.',
          },
        },
      },
    },
    { upsert: true }
  );
  console.log(`  ${'platformSettings'.padEnd(14)}    1`);

  console.log(`
Done. Everything is in "${dbName}".

Sign in (passwords are the same on every account in a group):
  Super admin  /admin/login   admin@citycart.local            ${PASSWORDS.admin}
  Brand owner  /sell/login    brand@citycart.local            ${PASSWORDS.brand}   (Loom & Co., the fullest account)
  Other owners /sell/login    hamza.sheikh@citycart.demo and the rest   ${PASSWORDS.demo}
  Rider        partner app    shoaib.raza@citycart.demo (Loom & Co.)   ${PASSWORDS.demo}
  Picker       partner app    areeba.saleem@citycart.demo (Loom & Co., one per active brand)   ${PASSWORDS.demo}
  Staff        /sell/login    usman.tariq@citycart.demo (orders) / fatima.noor@citycart.demo (catalogue)   ${PASSWORDS.demo}
  Records      partner app    hira.anwar@citycart.demo (Loom & Co.: orders, deliveries, riders, receipts, cash)   ${PASSWORDS.demo}
  Service      /service/login service@citycart.local (Sana Home Cleaning)   ${PASSWORDS.demo}
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