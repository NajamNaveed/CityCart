/**
 * AI demo fixtures for a database that already has data.
 *
 * The marketplace seeds (scripts/seedDemo.js, scripts/showcase/seedShowcase.js) build a
 * realistic shop. Realistic is not the same as complete: an AI endpoint that needs three
 * approved reviews on ONE product, or a half-picked order whose line is out of stock,
 * answers "not enough data" on a shop that is merely busy. This script reads the database as
 * it stands and adds ONLY what is missing, so every AI feature answers on the first click.
 *
 *   cd server
 *   node scripts/seedAiFixtures.js                  read-only report: ready / needs fixtures
 *   node scripts/seedAiFixtures.js --apply          write what is missing
 *   node scripts/seedAiFixtures.js --undo           delete only the rows this script wrote
 *   node scripts/seedAiFixtures.js --brand="Loom"   choose the tenant (default: busiest ACTIVE brand)
 *   node scripts/seedAiFixtures.js --images --apply repoint photos whose Cloudinary link
 *                                                   no longer resolves (404), nothing else
 *
 * Without --apply it performs no write of any kind. It never drops a database and never
 * deletes a row it did not create; every id it writes goes into demo/.ai-fixtures.json (git-
 * ignored), and --undo deletes exactly those ids. Two things are edited rather than created,
 * so --undo leaves them: a brand's blank delivery promise and a service provider's working
 * windows — both ordinary settings that stay editable in the UI.
 *
 * Every fixture is dated from `now`, so the 7/30/90-day AI windows keep finding them.
 * Fixture names and notes all carry the "AI demo" mark, so they are recognisable in the UI
 * and in a database browser.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { parsePromise } = require('../src/services/ai/promiseCheck.rules');
const { completeWeeks, weekIndexOf } = require('../src/services/ai/restockCalendar.rules');

const Product = require('../src/models/product.model');
const Inventory = require('../src/models/inventory.model');
const Review = require('../src/models/review.model');
const Order = require('../src/models/order.model');
const Conversation = require('../src/models/conversation.model');
const Message = require('../src/models/message.model');
const CatalogProduct = require('../src/models/catalogProduct.model');
const Category = require('../src/models/category.model');
const Brand = require('../src/models/brand.model');
const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Return = require('../src/models/return.model');
const BillingHelp = require('../src/models/billingHelp.model');
const SellerInvoice = require('../src/models/sellerInvoice.model');
const CommissionEntry = require('../src/models/commissionEntry.model');
const ServiceAvailability = require('../src/models/serviceAvailability.model');
const AiUsage = require('../src/models/aiUsage.model');
const Counter = require('../src/models/counter.model');
const Address = require('../src/models/address.model');
const Branch = require('../src/models/branch.model');
const Block = require('../src/models/block.model');
const City = require('../src/models/city.model');

const { ObjectId } = mongoose.Types;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const MARK = 'AI demo';
const MANIFEST = path.resolve(__dirname, 'demo', '.ai-fixtures.json');
// Photos the seeds put on Cloudinary. seed:demo uploads the Images/ folders there, so a
// Cloudinary link is not stale by itself: it is stale only when Cloudinary answers 404.
const CLOUDINARY_RE = /^https?:\/\/res\.cloudinary\.com\//i;

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * Which of these links the host says are gone. A link that cannot be reached at all (no
 * network, slow DNS) is NOT counted as gone: an unreachable photo is a bad reason to throw
 * away a working link, so anything other than a clear 404/403 is left alone.
 */
async function deadCloudinaryLinks(urls, { fetchImpl = global.fetch, concurrency = 8 } = {}) {
  const dead = new Set();
  const queue = [...new Set(urls.filter((url) => CLOUDINARY_RE.test(url)))];
  if (!queue.length || typeof fetchImpl !== 'function') return dead;
  const check = async (url) => {
    try {
      const response = await fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      if (response.status === 404 || response.status === 410 || response.status === 403) dead.add(url);
    } catch {
      // Unreachable is not the same as deleted.
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await check(queue.shift());
  });
  await Promise.all(workers);
  return dead;
}

// Same placeholder scheme the seeds use, so the demo listings look like the rest of the shop.
function photo(keyword, n, width = 900, height = 1100) {
  const seed = String(keyword).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `https://picsum.photos/seed/${seed}-${n}/${width}/${height}`;
}

/**
 * Validate a fixture through its real schema, then insert it as written.
 *
 * Not Model.create(): mongoose timestamps would move createdAt back to the moment of the run,
 * and these fixtures ARE their dates — a deadstock line has to sit at 100 days, a restock week
 * has to land inside its own Monday week. Same reason the seed runners insert raw.
 */
async function insert(Model, raw) {
  const doc = { _id: new ObjectId(), ...raw };
  const problem = new Model(doc).validateSync();
  if (problem) {
    throw new Error(`${Model.modelName} fixture is invalid (${doc.name || doc.orderNumber || doc.agent}): ${problem.message}`);
  }
  await Model.collection.insertOne(doc);
  return doc;
}

// ── the shop this script is about to patch ──────────────────────────────────
async function resolveContext({ brandFlag }) {
  let brand;
  if (brandFlag) {
    const escaped = brandFlag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    brand = await Brand.findOne({
      $or: [{ slug: brandFlag }, { name: { $regex: escaped, $options: 'i' } }],
    }).lean();
    if (!brand) throw new Error(`No brand matches "${brandFlag}".`);
  } else {
    const busiest = await Order.aggregate([
      { $match: { orderStatus: 'DELIVERED' } },
      { $group: { _id: '$brandId', orders: { $sum: 1 } } },
      { $sort: { orders: -1 } },
      { $limit: 12 },
    ]);
    for (const row of busiest) {
      const candidate = await Brand.findOne({ _id: row._id, status: 'ACTIVE' }).lean();
      if (!candidate || candidate.billingStatus === 'FROZEN') continue;
      brand = candidate;
      break;
    }
    if (!brand) {
      const brands = await Brand.find({}).select('name status').lean().limit(20);
      const seen = brands.length
        ? `Brands in this database: ${brands.map((b) => `${b.name} [${b.status}]`).join(', ')}.`
        : `Database "${mongoose.connection.name}" holds no brands at all — run a marketplace seed first.`;
      throw new Error(`No ACTIVE brand with delivered orders to attach the fixtures to. ${seen}`);
    }
  }

  const brandId = brand._id;
  const topCategory = await Product.aggregate([
    { $match: { brandId, status: 'ACTIVE' } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  let categoryId = topCategory[0]?._id || null;
  if (!categoryId) {
    const anyCategory = await Category.findOne({ isActive: true }).select('_id').lean();
    categoryId = anyCategory ? anyCategory._id : null;
  }
  if (!categoryId) throw new Error('There is no category to file the demo listings under.');

  const buyers = await User.find({ role: 'CUSTOMER', isActive: true })
    .select('_id name email').lean().sort({ createdAt: 1 }).limit(24);
  if (!buyers.length) throw new Error('There are no customer accounts to write the demo orders for.');

  // The demo seed links staff two ways: owners and staff carry role + brandId on
  // the User itself, while pickers are additionally Employee rows. Read both so a
  // fixture never lands on a shop with no one to sign in as.
  const staff = await User.find({ brandId, isActive: true, deletedAt: null })
    .select('_id name email role').lean();
  const members = await Employee.find({ brandId, isActive: true, removedAt: null }).lean();
  const staffIn = (role) => staff.find((u) => u.role === role) || null;
  const memberLinkedTo = (role) => {
    const membership = members.find((m) => m.role === role);
    if (!membership) return null;
    return staff.find((u) => String(u._id) === String(membership.userId)) || null;
  };

  // A listing only counts as carrying a dead photo when the link itself answers 404, so a
  // seed that put real photos on Cloudinary is left alone and an offline run says "nothing stale".
  const imageRows = await Product.find({ brandId, images: CLOUDINARY_RE }).select('images').lean();
  const deadImages = await deadCloudinaryLinks(imageRows.flatMap((row) => row.images));
  const staleImages = imageRows.filter((row) => row.images.some((url) => deadImages.has(url))).length;

  return {
    now: new Date(),
    apply: false,
    sequenceIndex: 0,
    brand,
    brandId,
    categoryId,
    buyers,
    owner: staffIn('BRAND_ADMIN') || staff[0] || null,
    employee: staffIn('BRAND_EMPLOYEE') || memberLinkedTo('BRAND_EMPLOYEE'),
    picker: staffIn('PICKER') || memberLinkedTo('PICKER'),
    staleImages,
    deadImages,
  };
}

// A demo listing is catalogue row + product + stock. In report mode it is only looked up.
async function listing(ctx, def) {
  const found = await Product.findOne({ brandId: ctx.brandId, name: def.name }).lean();
  if (found) {
    const inventory = await Inventory.findOne({ productId: found._id }).lean();
    return { product: found, inventory, isNew: false };
  }
  if (!ctx.apply) return { product: null, inventory: null, isNew: false };

  const catalog = await insert(CatalogProduct, {
    name: def.name, slug: def.slug, description: def.description, images: def.images,
    barcode: def.barcode, scope: 'PRIVATE', status: 'ACTIVE',
    brandId: ctx.brandId, categoryId: ctx.categoryId,
    createdAt: ctx.now, updatedAt: ctx.now,
  });
  const product = await insert(Product, {
    brandId: ctx.brandId, catalogProductId: catalog._id, categoryId: ctx.categoryId,
    name: def.name, slug: def.slug, description: def.description, images: def.images,
    price: def.price, compareAtPrice: def.compareAtPrice, sku: `AID-${pad(def.skuNo, 3)}`,
    isActive: true, status: 'ACTIVE', attributes: def.attributes || {}, branchIds: [],
    createdAt: ctx.now, updatedAt: ctx.now,
  });
  const inventory = await insert(Inventory, {
    brandId: ctx.brandId, productId: product._id, quantity: def.quantity,
    reservedQuantity: def.reserved || 0, lowStockThreshold: def.lowStock ?? 5,
    trackInventory: true, createdAt: ctx.now, updatedAt: ctx.now,
  });
  return { product, inventory, catalog, isNew: true };
}

async function nextOrderNumber(ctx) {
  const year = ctx.now.getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `order-${year}` }, { $inc: { seq: 1 } }, { new: true, upsert: true }
  );
  return `CC-${year}-${pad(counter.seq, 6)}`;
}

// One delivered order with a full stage trail: the delivery, report and calendar agents all
// read the trail, not just the final status.
async function deliveredOrder(ctx, { deliveredAt, lines, weekLabel }) {
  const created = new Date(deliveredAt.getTime() - 5 * DAY);
  const items = lines.map((line) => ({
    _id: new ObjectId(),
    productId: line.product._id,
    productName: line.product.name,
    sku: line.product.sku,
    quantity: line.quantity,
    unitPrice: line.product.price,
    totalPrice: line.quantity * line.product.price,
    image: line.product.images[0],
    pickStatus: 'PICKED',
    pickedQty: line.quantity,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const deliveryFee = 199;
  const buyer = ctx.buyers[ctx.sequenceIndex++ % ctx.buyers.length];
  const order = await insert(Order, {
    orderNumber: await nextOrderNumber(ctx),
    customerId: buyer._id,
    brandId: ctx.brandId,
    items,
    shippingAddress: {
      name: buyer.name,
      phone: '+92 300 1234567',
      address: 'Peoples Colony Number 1, Faisalabad',
      city: 'Faisalabad',
    },
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    paymentMethod: 'COD',
    paymentStatus: 'PAID',
    orderStatus: 'DELIVERED',
    fulfilment: 'FULL',
    returnedAmount: 0,
    feeRefunded: false,
    netTotal: subtotal + deliveryFee,
    currency: 'PKR',
    statusHistory: [
      { status: 'PENDING', at: created },
      { status: 'CONFIRMED', at: new Date(created.getTime() + 2 * HOUR) },
      { status: 'PROCESSING', at: new Date(created.getTime() + 9 * HOUR) },
      { status: 'SHIPPED', at: new Date(deliveredAt.getTime() - 26 * HOUR) },
      { status: 'OUT_FOR_DELIVERY', at: new Date(deliveredAt.getTime() - 5 * HOUR) },
      { status: 'DELIVERED', at: deliveredAt },
    ],
    notes: `${MARK} · sold ${weekLabel}`,
    activeAdjustmentId: null,
    pickerId: null,
    createdAt: created,
    updatedAt: deliveredAt,
  });
  return order;
}

// One customer may only ever review a product once — Review has a unique
// customerId+productId index. Walk the buyer pool for someone who has not yet
// written on this listing instead of guessing an index and hitting E11000.
async function freshReviewer(ctx, productId) {
  ctx.reviewerCursor = ctx.reviewerCursor || 0;
  for (let step = 0; step < ctx.buyers.length; step += 1) {
    const at = (ctx.reviewerCursor + step) % ctx.buyers.length;
    const buyer = ctx.buyers[at];
    const taken = await Review.findOne({ customerId: buyer._id, productId }).select('_id').lean();
    if (!taken) {
      ctx.reviewerCursor = (at + 1) % ctx.buyers.length;
      return buyer;
    }
  }
  throw new Error(`Every one of the ${ctx.buyers.length} demo customers has already reviewed this listing. `
    + 'Seed more customer accounts, or undo a previous fixture run with --undo.');
}

// ── the demo listings, and what each one exists to prove ────────────────────
const LISTINGS = [
  {
    key: 'summary', slug: 'ai-demo-lawn-kurta', name: `${MARK} · Embroidered Lawn Kurta`,
    price: 6450, quantity: 42, skuNo: 1, barcode: 'AID0000000001',
    description: 'Three-piece lawn suit in a digital-print lawn, with a hand-embroidered front panel, '
      + 'matched dyed lining for the trousers and an organza dupatta with a woven border. The shirt is '
      + 'cut in a straight knee-length silhouette with side slits and a mandarin collar, and the whole '
      + 'suit is stitched in our own workshop so the colour of all three pieces always matches.',
    images: [photo('ai demo kurta', 1), photo('ai demo kurta', 2), photo('ai demo kurta', 3)],
    attributes: { fabric: 'Lawn', colour: 'Powder blue', size: ['S', 'M', 'L'], stitch: 'Unstitched' },
    proves: 'review summary, reply draft, moderation: six approved reviews on ONE listing',
  },
  {
    key: 'thin', slug: 'ai-demo-twill-trouser', name: `${MARK} · Cotton Twill Trouser`,
    price: 3200, quantity: 0, lowStock: 0, skuNo: 2, barcode: 'AID0000000002',
    description: 'Cotton trouser.',
    images: [photo('ai demo trouser', 1)],
    proves: 'listing quality: four-word description, one photo, no attributes, no stock',
  },
  {
    key: 'good', slug: 'ai-demo-linen-shirt', name: `${MARK} · Linen No-Iron Shirt`,
    price: 4100, quantity: 30, skuNo: 3, barcode: 'AID0000000003',
    description: 'Garment-washed linen shirt cut for a relaxed shoulder, with a soft roll-down collar '
      + 'and a single chest pocket. The weave is breathable enough for a June afternoon and the finish '
      + 'means it comes off the line with no ironing, which is the whole point of it. Stitched in our '
      + 'own workshop with matched thread and tested colour fastness.',
    images: [photo('ai demo linen shirt', 1), photo('ai demo linen shirt', 2), photo('ai demo linen shirt', 3), photo('ai demo linen shirt', 4)],
    attributes: { fabric: 'Linen', fit: 'Relaxed', collar: 'Roll-down' },
    proves: 'listing quality: the complete listing to compare the thin one against',
  },
  {
    key: 'dead30', slug: 'ai-demo-slow-three-weeks', name: `${MARK} · Slow Seller, Last Sold 45 Days Ago`,
    price: 2800, quantity: 14, skuNo: 10, barcode: 'AID0000000010', soldAgo: 45,
    description: 'End-of-line cambric piece held in the warehouse. Cut and stitched in the same workshop '
      + 'as the rest of the catalogue, with the same thread and the same finishing, kept at its original '
      + 'price while the line runs out. The fabric is pre-washed and sizing follows the standard chart.',
    images: [photo('ai demo slow 45', 1), photo('ai demo slow 45', 2), photo('ai demo slow 45', 3)],
    attributes: { fabric: 'Cambric', colour: 'Stone' },
    proves: 'deadstock pricing: the 30-day rung',
  },
  {
    key: 'dead90', slug: 'ai-demo-slow-three-months', name: `${MARK} · Slow Seller, Last Sold 100 Days Ago`,
    price: 3700, compareAtPrice: 3100, quantity: 12, skuNo: 11, barcode: 'AID0000000011', soldAgo: 100,
    description: 'Three-piece suit held over from last season. Same workshop and same fabric grade as the '
      + 'lines that sell, kept on the shelf while the catalogue decides what it should cost. The compare-at '
      + 'price below the selling price is deliberate: it is the floor a markdown may not go under.',
    images: [photo('ai demo slow 100', 1), photo('ai demo slow 100', 2), photo('ai demo slow 100', 3)],
    attributes: { fabric: 'Lawn', colour: 'Sage' },
    proves: 'deadstock pricing: the 90-day rung, with a compare-at price as the floor',
  },
  {
    key: 'dead180', slug: 'ai-demo-slow-six-months', name: `${MARK} · Slow Seller, Last Sold 200 Days Ago`,
    price: 4600, quantity: 10, skuNo: 12, barcode: 'AID0000000012', soldAgo: 200,
    description: 'Winter shawl left over from two seasons back, still folded in its original packing. The '
      + 'wool blend is the same one used across the winter line and the finishing is identical; it has '
      + 'simply sat in the store since the last cold week, and the shop has not marked it down yet.',
    images: [photo('ai demo slow 200', 1), photo('ai demo slow 200', 2), photo('ai demo slow 200', 3)],
    attributes: { fabric: 'Wool blend', colour: 'Charcoal' },
    proves: 'deadstock pricing: the deepest rung inside the one-year lookback',
  },
  {
    key: 'deadOld', slug: 'ai-demo-slow-over-a-year', name: `${MARK} · Slow Seller, Last Sold 430 Days Ago`,
    price: 5500, quantity: 8, skuNo: 13, barcode: 'AID0000000013', soldAgo: 430,
    description: 'A piece that has now been on the shelf for more than a year. Nothing has sold it inside '
      + 'the lookback the agent reads, so it is shown on its own line and the shop is told the history is '
      + 'too old to price from, rather than being given a markdown built on guesswork.',
    images: [photo('ai demo slow 430', 1), photo('ai demo slow 430', 2), photo('ai demo slow 430', 3)],
    attributes: { fabric: 'Khaddar', colour: 'Rust' },
    proves: 'deadstock pricing: outside the one-year lookback',
  },
  {
    key: 'neverSold', slug: 'ai-demo-display-piece', name: `${MARK} · Display Piece, Never Sold`,
    price: 5400, quantity: 9, skuNo: 20, barcode: 'AID0000000020',
    description: 'A showroom piece with no order behind it yet. Same workshop, same fabric grade and the '
      + 'same finishing as the lines that do sell, held on the shop floor while the catalogue settles on '
      + 'a price for it. Sold as a single piece and packed flat so the work does not crease along a fold.',
    images: [photo('ai demo display', 1), photo('ai demo display', 2), photo('ai demo display', 3)],
    attributes: { fabric: 'Organza' },
    proves: 'deadstock pricing: a listing that has never sold at all',
  },
  {
    key: 'short', slug: 'ai-demo-chikankari-dupatta', name: `${MARK} · Chikankari Dupatta`,
    price: 3900, quantity: 0, lowStock: 4, skuNo: 30, barcode: 'AID0000000030',
    description: 'Hand-worked chikankari dupatta on a georgette ground, with the motifs gathered at both '
      + 'ends and a scalloped edge. Sold as a single piece and packed flat so the work does not crease '
      + 'along the fold. The most asked-for dupatta in the shop, and the one that runs out first.',
    images: [photo('ai demo dupatta', 1), photo('ai demo dupatta', 2), photo('ai demo dupatta', 3)],
    attributes: { fabric: 'Georgette', work: 'Chikankari' },
    proves: 'substitutions: the line a picker cannot fill',
  },
  {
    key: 'subA', slug: 'ai-demo-net-dupatta', name: `${MARK} · Net Dupatta With Woven Border`,
    price: 4200, quantity: 18, skuNo: 31, barcode: 'AID0000000031',
    description: 'Net dupatta with a woven border, the nearest thing in the shop to the chikankari piece '
      + 'and the one customers usually accept in its place. Same length and same edge finish, in stock '
      + 'through the season, and only a little dearer than the piece it stands in for.',
    images: [photo('ai demo net dupatta', 1), photo('ai demo net dupatta', 2), photo('ai demo net dupatta', 3)],
    attributes: { fabric: 'Net' },
    proves: 'substitutions: an in-stock substitute at a near price',
  },
  {
    key: 'subB', slug: 'ai-demo-mulmul-dupatta', name: `${MARK} · Mulmul Dupatta`,
    price: 2900, quantity: 25, skuNo: 32, barcode: 'AID0000000032',
    description: 'Lightweight mulmul dupatta, plain with a rolled edge, cheaper than the worked pieces and '
      + 'always in stock. It is the fallback a picker offers when nothing embroidered is left and the '
      + 'customer would rather have something to wear than wait for the next batch.',
    images: [photo('ai demo mulmul dupatta', 1), photo('ai demo mulmul dupatta', 2), photo('ai demo mulmul dupatta', 3)],
    attributes: { fabric: 'Mulmul' },
    proves: 'substitutions: a cheaper in-stock substitute',
  },
  {
    key: 'subFar', slug: 'ai-demo-kantha-dupatta', name: `${MARK} · Kantha-Work Bridal Dupatta`,
    price: 24000, quantity: 6, skuNo: 33, barcode: 'AID0000000033',
    description: 'Bridal kantha-work dupatta, heavily embroidered and priced as a bridal piece. It sits in '
      + 'the same category and it is in stock, and no shop would send it in place of an ordinary dupatta '
      + 'six times its price — which is exactly why it is here, as the one suggestion to refuse.',
    images: [photo('ai demo kantha dupatta', 1), photo('ai demo kantha dupatta', 2), photo('ai demo kantha dupatta', 3)],
    attributes: { fabric: 'Silk', work: 'Kantha' },
    proves: 'substitutions: the far-price decoy the agent must not suggest',
  },
  {
    key: 'weekly', slug: 'ai-demo-basmati-rice', name: `${MARK} · Basmati Rice 5kg`,
    price: 2250, quantity: 120, lowStock: 20, skuNo: 40, barcode: 'AID0000000040',
    description: 'Aged long-grain basmati in a five-kilo bag, sorted twice and packed with the moisture '
      + 'checked before sealing. The staple of the shop: the same households reorder it every week, which '
      + 'makes it the clearest line to read a restock rhythm off.',
    images: [photo('ai demo basmati rice', 1), photo('ai demo basmati rice', 2), photo('ai demo basmati rice', 3)],
    attributes: { weight: '5 kg', grade: 'Aged' },
    proves: 'restock calendar, weekly report, seller advisor: sold in all eight complete weeks',
  },
];

const REVIEWS = [
  { rating: 5, title: 'Better than the photos', comment: 'The embroidery is fine work and the colour matched my screen exactly. The lining makes the trousers feel heavier than they are, in a good way.' },
  { rating: 5, title: 'Ordering the second one', comment: 'Wore it to a wedding and three people asked where it was from. The stitching held up after two washes with no colour run at all.' },
  { rating: 4, title: 'Very good, sizing runs large', comment: 'Beautiful suit but the shirt is longer than I expected. I would order a size down. Delivery was quick and the packing was neat.' },
  { rating: 3, title: 'Decent for the price', comment: 'The fabric is thinner than I imagined from the photos. It is still wearable and the print is sharp, but I expected more weight.' },
  { rating: 2, title: 'Dupatta arrived creased', comment: 'The suit itself is fine but the dupatta came with a hard crease across the middle that would not steam out. Support replied the same day.' },
  { rating: 1, title: 'Wrong colour sent', comment: 'Ordered powder blue and received a greenish shade. The shop agreed it was a picking error and offered to swap it, so I am sending this one back.' },
];
// Left unpublished on purpose: this is what the moderation queue looks like.
const PENDING_REVIEWS = [
  { rating: 1, title: 'useless junk', comment: 'Absolute trash, the seller is a cheating fraud and I want my money back right now or I will report this useless shop to everyone I know.' },
  { rating: 5, title: 'Follow my page', comment: 'Great product!! click here http://deals-fast.example.com to get 90 percent off, I got two from this link and so should you, message me for the code.' },
  { rating: 2, title: 'Late but the cotton is good', comment: 'Took six days instead of three and the box was dented, but the kurta itself is fine and the cotton is good quality for the price.' },
];

const AGENT_NAMES = [
  'listing-draft', 'review-summary', 'chat-translate', 'shop-assistant', 'order-helper',
  'service-helper', 'recipe-list', 'compare', 'chat-draft', 'seller-advisor', 'catalogue-match',
  'csv-clean', 'reply-draft', 'returns-insights', 'restock-calendar', 'listing-quality',
  'shop-report', 'promise-check', 'billing-explain', 'deadstock-pricing', 'substitutions',
  'admin-triage', 'moderation',
];

// The block the demo shop physically stands in. A shopper has to be inside it
// before "shops in my block" has anything to find (docs/29 §2h).
async function shopBlock(ctx) {
  const branch = await Branch.findOne({ brandId: ctx.brandId, isActive: true }).select('blockId').lean();
  if (!branch) return null;
  return Block.findOne({ _id: branch.blockId, isActive: true }).select('name cityId center').lean();
}

// ── the features, one check each ────────────────────────────────────────────
// check(ctx, L) answers "can this be demoed today". fix(ctx, L) writes what was missing and
// returns { ids, note }. A feature whose check passes needs no fix; a feature that the demo
// listings themselves satisfy returns no ids and says so.
const FEATURES = [
  {
    label: 'Review summary',
    where: 'product page · GET /api/v1/ai/products/:id/review-summary',
    async check(ctx) {
      const rows = await Product.aggregate([
        { $match: { brandId: ctx.brandId, status: 'ACTIVE' } },
        { $lookup: { from: 'reviews', localField: '_id', foreignField: 'productId', as: 'r' } },
        { $project: { approved: { $size: { $filter: { input: '$r', as: 'x', cond: { $eq: ['$$x.isApproved', true] } } } } } },
        { $match: { approved: { $gte: 3 } } },
        { $limit: 1 },
      ]);
      return { ready: rows.length > 0, note: rows.length ? 'a listing already carries 3+ approved reviews' : 'no single listing reaches the 3-review minimum' };
    },
    async fix(ctx, L) {
      const made = [];
      for (let i = 0; i < REVIEWS.length; i += 1) {
        const at = new Date(ctx.now.getTime() - (3 + i * 4) * DAY);
        const buyer = await freshReviewer(ctx, L.summary.product._id);
        made.push(await insert(Review, {
          customerId: buyer._id, productId: L.summary.product._id,
          brandId: ctx.brandId, orderId: null, rating: REVIEWS[i].rating,
          title: REVIEWS[i].title, comment: REVIEWS[i].comment,
          isApproved: true, createdAt: at, updatedAt: at,
        }));
      }
      const hidden = new Date(ctx.now.getTime() - 2 * DAY);
      const hiddenBuyer = await freshReviewer(ctx, L.summary.product._id);
      made.push(await insert(Review, {
        customerId: hiddenBuyer._id, productId: L.summary.product._id,
        brandId: ctx.brandId, orderId: null, rating: 4, isApproved: false,
        title: `${MARK} · kept unpublished`,
        comment: 'A quiet four-star note the shop chose not to publish, so the summary must not count it.',
        createdAt: hidden, updatedAt: hidden,
      }));
      return { ids: made.map((d) => d._id), note: `6 approved and 1 unpublished review on ${L.summary.product.name}` };
    },
  },
  {
    label: 'Reply draft, then posting it',
    where: 'brand Reviews · POST /api/v1/ai/reply-draft + POST /api/v1/reviews/:id/reply',
    async check(ctx) {
      const open = await Review.countDocuments({ brandId: ctx.brandId, isApproved: true, brandReply: null });
      const answered = await Review.countDocuments({ brandId: ctx.brandId, isApproved: true, 'brandReply.body': { $exists: true } });
      return { ready: open > 0 && answered > 0, note: `${open} review(s) to answer, ${answered} already answered` };
    },
    async fix(ctx, L) {
      const productId = L.summary ? L.summary.product._id : (await Product.findOne({ brandId: ctx.brandId }).select('_id').lean())._id;
      const base = new Date(ctx.now.getTime() - 5 * DAY);
      const openBuyer = await freshReviewer(ctx, productId);
      const open = await insert(Review, {
        customerId: openBuyer._id, productId, brandId: ctx.brandId, orderId: null,
        rating: 4, isApproved: true, title: `${MARK} · waiting for an answer`,
        comment: 'The kurta is lovely but the trousers needed a hem. Otherwise I am happy and would order again.',
        createdAt: base, updatedAt: base,
      });
      const answeredBuyer = await freshReviewer(ctx, productId);
      const answered = await insert(Review, {
        customerId: answeredBuyer._id, productId, brandId: ctx.brandId, orderId: null,
        rating: 5, isApproved: true, title: `${MARK} · already answered`,
        comment: 'Fast delivery and the fabric is soft. Thank you to the team for the careful packing.',
        brandReply: { body: 'Thank you — we are glad it arrived safely. Write to us when you want the second colour.', at: new Date(ctx.now.getTime() - 4 * DAY) },
        createdAt: new Date(ctx.now.getTime() - 6 * DAY), updatedAt: new Date(ctx.now.getTime() - 4 * DAY),
      });
      const hiddenBuyer = await freshReviewer(ctx, productId);
      const hidden = await insert(Review, {
        customerId: hiddenBuyer._id, productId, brandId: ctx.brandId, orderId: null,
        rating: 2, isApproved: false, title: `${MARK} · unpublished, so not answerable`,
        comment: 'Not published, so drafting a reply here must be refused.',
        createdAt: base, updatedAt: base,
      });
      return { ids: [open._id, answered._id, hidden._id], note: 'one to answer, one already answered, one unpublished' };
    },
  },
  {
    label: 'Review moderation',
    where: 'admin Reviews · POST /api/v1/ai/moderate',
    async check(ctx) {
      const pending = await Review.countDocuments({ brandId: ctx.brandId, isApproved: false });
      return { ready: pending >= 3, note: `${pending} unpublished review(s) in the queue` };
    },
    async fix(ctx, L) {
      const productId = L.summary ? L.summary.product._id : (await Product.findOne({ brandId: ctx.brandId }).select('_id').lean())._id;
      const made = [];
      for (let i = 0; i < PENDING_REVIEWS.length; i += 1) {
        const at = new Date(ctx.now.getTime() - (1 + i) * DAY);
        const buyer = await freshReviewer(ctx, productId);
        made.push(await insert(Review, {
          customerId: buyer._id, productId, brandId: ctx.brandId,
          orderId: null, rating: PENDING_REVIEWS[i].rating, title: `${MARK} · ${PENDING_REVIEWS[i].title}`,
          comment: PENDING_REVIEWS[i].comment, isApproved: false, createdAt: at, updatedAt: at,
        }));
      }
      return { ids: made.map((d) => d._id), note: 'abusive text, spam with a link, and a clean low rating' };
    },
  },
  {
    label: 'Chat draft and translate',
    where: 'brand Messages · POST /api/v1/ai/chat-draft + POST /api/v1/ai/translate',
    async check(ctx) {
      const waiting = await Conversation.countDocuments({ brandId: ctx.brandId, lastSenderRole: 'CUSTOMER' });
      const shopOnly = await Conversation.countDocuments({ brandId: ctx.brandId, lastSenderRole: 'BRAND' });
      return { ready: waiting > 0 && shopOnly > 0, note: `${waiting} thread(s) waiting on the shop, ${shopOnly} with nothing to answer` };
    },
    async fix(ctx, L) {
      const replyingAs = ctx.employee || ctx.owner;
      if (!replyingAs) throw new Error('This brand has no staff account to write the shop side of a chat as.');
      const ids = [];
      const threads = [
        {
          buyer: ctx.buyers[4 % ctx.buyers.length],
          lines: [
            ['BRAND', 'Good afternoon. The suit is stitched and will be packed today.', 260],
            ['CUSTOMER', 'Thank you. Is there any way the dupatta could be folded flat instead of rolled? It creases badly when it is rolled.', 40],
          ],
        },
        {
          buyer: ctx.buyers[5 % ctx.buyers.length],
          lines: [
            ['CUSTOMER', 'Has my parcel left the warehouse yet?', 300],
            ['BRAND', 'It left an hour ago. The rider will call you when he is close.', 180],
          ],
        },
      ];
      for (const thread of threads) {
        const conversationId = new ObjectId();
        const docs = thread.lines.map(([who, text, minutesAgo]) => {
          const at = new Date(ctx.now.getTime() - minutesAgo * 60 * 1000);
          return {
            _id: ObjectId.createFromTime(Math.floor(at.getTime() / 1000)),
            conversationId,
            senderId: who === 'CUSTOMER' ? thread.buyer._id : replyingAs._id,
            senderRole: who === 'CUSTOMER' ? 'CUSTOMER' : 'BRAND',
            body: `${MARK} · ${text}`,
            productId: L.summary ? L.summary.product._id : undefined,
            createdAt: at, updatedAt: at,
          };
        });
        const last = docs[docs.length - 1];
        const firstOfLastRun = docs.find((d) => d.senderRole === last.senderRole);
        const unread = docs.filter((d) => d.senderRole === last.senderRole && d.createdAt >= firstOfLastRun.createdAt).length;
        await insert(Conversation, {
          _id: conversationId,
          customerId: thread.buyer._id, brandId: ctx.brandId,
          lastMessageAt: last.createdAt, lastMessagePreview: last.body.slice(0, 100),
          lastSenderRole: last.senderRole,
          customerUnread: last.senderRole === 'BRAND' ? unread : 0,
          brandUnread: last.senderRole === 'CUSTOMER' ? unread : 0,
          createdAt: docs[0].createdAt, updatedAt: last.createdAt,
        });
        const saved = [];
        for (const doc of docs) saved.push(await insert(Message, doc));
        ids.push(conversationId, ...saved.map((m) => m._id));
      }
      return { ids, note: 'one thread waiting on the shop, one that holds only shop messages' };
    },
  },
  {
    label: 'Delivery promise check',
    where: 'brand Deliveries · POST /api/v1/ai/promise-check',
    async check(ctx) {
      const parsed = parsePromise(ctx.brand.settings && ctx.brand.settings.estimatedDeliveryTime);
      if (!parsed.minutes) return { ready: false, note: `no readable promise in the settings (${parsed.reason.toLowerCase()})` };
      const measured = await Order.countDocuments({
        brandId: ctx.brandId, orderStatus: 'DELIVERED',
        'statusHistory.status': 'OUT_FOR_DELIVERY',
        updatedAt: { $gte: new Date(ctx.now.getTime() - 30 * DAY) },
      });
      return { ready: measured > 0, note: `promise "${parsed.readable}", ${measured} delivered order(s) to measure` };
    },
    async fix(ctx) {
      return { ids: [], note: 'written onto the brand settings, and measured by the demo orders' };
    },
  },
  {
    label: 'Suggested substitutions',
    where: 'Staff app · POST /api/v1/ai/substitutions',
    async check(ctx) {
      if (!ctx.picker) return { ready: false, note: 'this brand has no PICKER account to sign in with' };
      const picking = await Order.countDocuments({
        brandId: ctx.brandId, pickerId: ctx.picker._id, packedAt: null,
        orderStatus: { $in: ['CONFIRMED', 'PROCESSING'] },
        'items.pickStatus': { $in: ['SHORT', 'UNAVAILABLE'] },
      });
      return { ready: picking > 0, note: `${picking} half-picked order(s) assigned to ${ctx.picker.email}` };
    },
    async fix(ctx, L) {
      if (!ctx.picker) return { ids: [], note: 'no picker on this brand — assign one in the staff screen first' };
      const lines = [
        { product: L.short.product, quantity: 2, picked: 0, pickStatus: 'UNAVAILABLE' },
        { product: L.subA.product, quantity: 3, picked: 1, pickStatus: 'SHORT' },
        { product: L.weekly.product, quantity: 1, picked: 1, pickStatus: 'PICKED' },
      ];
      const items = lines.map((line) => ({
        _id: new ObjectId(),
        productId: line.product._id, productName: line.product.name, sku: line.product.sku,
        quantity: line.quantity, unitPrice: line.product.price,
        totalPrice: line.quantity * line.product.price, image: line.product.images[0],
        pickStatus: line.pickStatus, pickedQty: line.picked,
      }));
      const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const created = new Date(ctx.now.getTime() - 6 * HOUR);
      const buyer = ctx.buyers[6 % ctx.buyers.length];
      const order = await insert(Order, {
        orderNumber: await nextOrderNumber(ctx),
        customerId: buyer._id, brandId: ctx.brandId, items,
        shippingAddress: {
          name: buyer.name, phone: '+92 300 1234567',
          address: 'Peoples Colony Number 1, Faisalabad', city: 'Faisalabad',
        },
        subtotal, deliveryFee: 199, total: subtotal + 199,
        paymentMethod: 'COD', paymentStatus: 'PENDING', orderStatus: 'PROCESSING',
        pickerId: ctx.picker._id, pickStartedAt: new Date(ctx.now.getTime() - 4 * HOUR), packedAt: null,
        statusHistory: [
          { status: 'PENDING', at: created },
          { status: 'CONFIRMED', at: new Date(created.getTime() + HOUR) },
          { status: 'PROCESSING', at: new Date(ctx.now.getTime() - 4 * HOUR) },
        ],
        notes: `${MARK} · the order a picker is standing at`,
        createdAt: created, updatedAt: new Date(ctx.now.getTime() - 4 * HOUR),
      });
      return {
        ids: [order._id, ...order.items.map((item) => item._id)],
        note: `one order for ${ctx.picker.email}: a line with no stock and a line one short`,
      };
    },
  },
  {
    label: 'Restock calendar',
    where: 'brand Stock · POST /api/v1/ai/restock-calendar',
    async check(ctx) {
      const weeks = await weekBuckets(ctx, 8);
      return { ready: weeks.length >= 4, note: `${weeks.length} complete sales week(s) in the last 8` };
    },
    async fix(ctx, L) {
      const ids = [];
      const weeks = completeWeeks(8, ctx.now);
      for (let i = 0; i < weeks.length; i += 1) {
        const midweek = new Date(weeks[i].from.getTime() + 3 * DAY);
        // The last two weeks sell double, so the spike the agent reports is real.
        const units = i >= weeks.length - 2 ? 9 : 3 + (i % 4);
        const order = await deliveredOrder(ctx, {
          deliveredAt: midweek,
          lines: [{ product: L.weekly.product, quantity: units }],
          weekLabel: `${weeks[i].from.getUTCDate()}/${weeks[i].from.getUTCMonth() + 1} · ${units} unit(s)`,
        });
        ids.push(order._id);
      }
      // One sold yesterday: the weekly report compares this week against last week,
      // and promise-check only reads orders delivered inside its 7-day window.
      const recent = await deliveredOrder(ctx, {
        deliveredAt: new Date(ctx.now.getTime() - 20 * HOUR),
        lines: [{ product: L.weekly.product, quantity: 4 }, { product: L.good.product, quantity: 1 }],
        weekLabel: 'yesterday',
      });
      ids.push(recent._id);
      return { ids, note: 'eight delivered weekly orders with a real spike, plus one sold yesterday' };
    },
  },
  {
    label: 'Weekly shop report',
    where: 'brand Analytics · POST /api/v1/ai/shop-report',
    async check(ctx) {
      const thisWeek = await Order.countDocuments({ brandId: ctx.brandId, createdAt: { $gte: new Date(ctx.now.getTime() - 7 * DAY) } });
      const lastWeek = await Order.countDocuments({
        brandId: ctx.brandId,
        createdAt: { $gte: new Date(ctx.now.getTime() - 14 * DAY), $lt: new Date(ctx.now.getTime() - 7 * DAY) },
      });
      return { ready: thisWeek > 0 && lastWeek > 0, note: `${thisWeek} order(s) this week, ${lastWeek} last week to compare with` };
    },
    async fix(ctx, L) {
      // Week-on-week needs an order PLACED in the previous seven days. The calendar
      // fixtures are all delivered inside complete weeks, so add one dated last week.
      const order = await deliveredOrder(ctx, {
        deliveredAt: new Date(ctx.now.getTime() - 5 * DAY),
        lines: [{ product: L.weekly.product, quantity: 3 }],
        weekLabel: 'ordered last week, delivered this week',
      });
      return { ids: [order._id], note: `one order placed ${new Date(order.createdAt).toISOString().slice(0, 10)} so last week is not empty` };
    },
  },
  {
    label: 'Seller advisor',
    where: 'brand dashboard · POST /api/v1/ai/seller-advisor',
    async check(ctx) {
      const orders = await Order.countDocuments({ brandId: ctx.brandId, createdAt: { $gte: new Date(ctx.now.getTime() - 30 * DAY) } });
      const low = await Inventory.countDocuments({ brandId: ctx.brandId, lowStockThreshold: { $gt: 0 }, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } });
      return { ready: orders > 0 && low > 0, note: `${orders} order(s) in 30 days, ${low} listing(s) at or below their low-stock line` };
    },
    async fix(ctx) {
      return { ids: [], note: 'the thin demo listing is deliberately at zero stock' };
    },
  },
  {
    label: 'Listing quality score',
    where: 'brand Catalogue · POST /api/v1/ai/listing-quality',
    async check(ctx) {
      const thin = await Product.countDocuments({ brandId: ctx.brandId, status: 'ACTIVE', description: { $lte: 'Cotton trouser.' } });
      const complete = await Product.aggregate([
        { $match: { brandId: ctx.brandId, status: 'ACTIVE' } },
        { $project: { photos: { $size: { $ifNull: ['$images', []] } }, words: { $size: { $split: ['$description', ' '] } } } },
        { $match: { photos: { $gte: 3 }, words: { $gte: 25 } } },
        { $limit: 1 },
      ]);
      return { ready: thin > 0 && complete.length > 0, note: `${thin ? 'a thin listing exists' : 'no thin listing to score'}, ${complete.length ? 'a complete one exists' : 'no complete one to compare'}` };
    },
    async fix(ctx) {
      return { ids: [], note: 'both ends of the score are among the demo listings' };
    },
  },
  {
    label: 'Deadstock re-pricing',
    where: 'brand Stock · POST /api/v1/ai/deadstock-pricing',
    async check(ctx) {
      const sitting = await sittingCount(ctx, 30);
      return { ready: sitting >= 4, note: `${sitting} tracked listing(s) with stock and no sale in 30 days` };
    },
    async fix(ctx) {
      return { ids: [], note: 'the six slow demo listings, one per price rung' };
    },
  },
  {
    label: 'Catalogue match',
    where: 'brand Catalogue · POST /api/v1/ai/catalogue-match',
    async check(ctx) {
      const global = await CatalogProduct.countDocuments({ status: 'ACTIVE', scope: 'GLOBAL' });
      const mirrored = await CatalogProduct.countDocuments({ status: 'ACTIVE', scope: 'GLOBAL', barcode: 'AID0000000091' });
      return { ready: global >= 2 && mirrored === 1, note: `${global} global catalogue row(s), ${mirrored ? 'one mirrors a live listing' : 'none mirroring a live listing'}` };
    },
    async fix(ctx) {
      const real = await Product.findOne({
        brandId: ctx.brandId, status: 'ACTIVE', name: { $not: new RegExp(`^${MARK}`) },
      }).select('name').lean();
      const made = [
        await insert(CatalogProduct, {
          name: real ? real.name : 'Embroidered Lawn Kurta', slug: 'ai-demo-mirror-of-a-live-listing',
          description: 'A catalogue entry that matches a listing this shop already sells, so the matcher has something to find.',
          images: [photo('ai demo mirror', 1)], barcode: 'AID0000000091',
          scope: 'GLOBAL', status: 'ACTIVE', brandId: null, categoryId: ctx.categoryId,
          createdAt: ctx.now, updatedAt: ctx.now,
        }),
        await insert(CatalogProduct, {
          name: 'Ariel Power Sheets Detergent 1kg', slug: 'ai-demo-new-detergent',
          description: 'A high-frequency catalogue entry this shop has not listed yet, so the matcher can suggest adding it.',
          images: [photo('ariel power sheets', 1)], barcode: 'AID0000000092',
          scope: 'GLOBAL', status: 'ACTIVE', brandId: null, categoryId: ctx.categoryId,
          createdAt: ctx.now, updatedAt: ctx.now,
        }),
      ];
      return { ids: made.map((d) => d._id), note: `mirrors "${real ? real.name : 'a listing'}" and one the shop is missing` };
    },
  },
  {
    label: 'CSV cleaner',
    where: 'brand Catalogue · POST /api/v1/ai/csv-clean (text/csv body)',
    async check(ctx) {
      const known = await CatalogProduct.countDocuments({ status: 'ACTIVE', barcode: { $in: ['AID0000000091', 'AID0000000092'] } });
      const sample = path.resolve(__dirname, 'demo', 'ai-demo-products.csv');
      const ready = known >= 1 && fs.existsSync(sample);
      const why = fs.existsSync(sample)
        ? (known >= 1 ? ', sample file present' : ', but no catalogue row for it to match yet')
        : ', but the sample file is not on disk';
      return { ready, note: `${known} catalogue row(s) the sample CSV can match${why}` };
    },
    async fix(ctx) {
      return { ids: [], note: 'upload scripts/demo/ai-demo-products.csv as-is' };
    },
  },
  {
    label: 'COD bill explainer',
    where: 'brand Billing · POST /api/v1/ai/billing-explain',
    async check(ctx) {
      const invoices = await SellerInvoice.find({
        sellerType: 'BRAND', sellerId: ctx.brandId, status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      }).select('_id').lean();
      let withSales = 0;
      for (const invoice of invoices) {
        if (await CommissionEntry.countDocuments({ invoiceId: invoice._id, kind: 'SALE', sourceType: 'ORDER' })) withSales += 1;
      }
      return { ready: withSales > 0, note: `${withSales} unpaid invoice(s) carrying per-order commission lines` };
    },
    async fix(ctx) {
      return { ids: [], note: 'a bill needs real order money behind it; this script will not invent any' };
    },
  },
  {
    label: 'Admin billing triage',
    where: 'admin · POST /api/v1/ai/admin-triage',
    async check(ctx) {
      const open = await BillingHelp.countDocuments({ sellerType: 'BRAND', sellerId: ctx.brandId, status: { $in: ['OPEN', 'PENDING'] } });
      return { ready: open > 0, note: `${open} open billing question(s) from this seller` };
    },
    async fix(ctx) {
      const at = new Date(ctx.now.getTime() - 6 * HOUR);
      const help = await insert(BillingHelp, {
        sellerType: 'BRAND', sellerId: ctx.brandId,
        subject: `${MARK} · the commission on one order looks wrong`,
        message: 'The invoice total does not match the orders I delivered this month. One order was returned after delivery and I was still charged the commission on it. Please check the line.',
        status: 'OPEN', createdAt: at, updatedAt: at,
      });
      return { ids: [help._id], note: 'one open billing question for the platform team to triage' };
    },
  },
  {
    label: 'Returns insights',
    where: 'brand Deliveries · POST /api/v1/ai/returns-insights',
    async check(ctx) {
      const rows = await Return.countDocuments({ brandId: ctx.brandId, createdAt: { $gte: new Date(ctx.now.getTime() - 90 * DAY) } });
      return { ready: rows >= 2, note: `${rows} return(s) in the last 90 days` };
    },
    async fix(ctx) {
      return { ids: [], note: 'a return needs a real delivery and payment trail; this script will not invent one' };
    },
  },
  {
    label: 'Service helper',
    where: 'customer chat · POST /api/v1/ai/chat with a service question',
    async check() {
      const published = await ServiceAvailability.countDocuments({ windows: { $not: { $size: 0 } } });
      return { ready: published > 0, note: `${published} provider(s) with published working windows` };
    },
    async fix(ctx) {
      const row = await ServiceAvailability.findOne({}).select('_id providerId').lean();
      if (!row) return { ids: [], note: 'no service provider exists to give a working week' };
      await ServiceAvailability.updateOne(
        { _id: row._id },
        { $set: { windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60, slotMinutes: 60 })) } }
      );
      return { ids: [], note: 'working hours written onto the existing availability row' };
    },
  },
  {
    label: 'Shopper location answers',
    where: 'customer chat · POST /api/v1/ai/chat with "which block am I in" / "shops in my block"',
    async check(ctx) {
      const block = await shopBlock(ctx);
      const saved = await Address.countDocuments({ isDefault: true });
      return {
        ready: saved > 0 && Boolean(block),
        note: `${saved} saved default address(es), ${block ? `a shop stands in "${block.name}"` : 'no active block holds this shop'}`,
      };
    },
    async fix(ctx) {
      const block = await shopBlock(ctx);
      if (!block) return { ids: [], note: 'this shop has no branch inside an active block — draw one on the Blocks page first' };
      const existing = await Address.findOne({ isDefault: true }).select('_id').lean();
      if (existing) return { ids: [], note: 'a saved home address already exists for the location answers to read' };
      const shopper = ctx.buyers[0];
      const city = await City.findById(block.cityId).select('name').lean();
      const at = new Date(ctx.now);
      const made = await insert(Address, {
        userId: shopper._id,
        // The centre is the pin the shopper's own blocks are worked out from, so
        // the address is placed in the block the shop itself stands in.
        label: 'AI demo home',
        fullName: shopper.name || 'Demo Customer',
        phone: '03001112233',
        addressLine: `${block.name}, ${city ? city.name : 'the demo city'} (${MARK})`,
        city: city ? city.name : 'Faisalabad',
        location: { type: 'Point', coordinates: block.center.coordinates },
        isDefault: true,
        createdAt: at,
        updatedAt: at,
      });
      return { ids: [made._id], note: `saved home address written for ${shopper.email} inside ${block.name}` };
    },
  },
  {
    label: 'AI cost and fallback report',
    where: 'admin AI usage · GET /api/v1/analytics/ai-usage',
    async check(ctx) {
      const since = new Date(ctx.now.getTime() - 30 * DAY);
      const rows = await AiUsage.countDocuments({ createdAt: { $gte: since } });
      const failed = await AiUsage.countDocuments({ createdAt: { $gte: since }, ok: false });
      return { ready: rows >= 12 && failed >= 1, note: `${rows} request(s) in 30 days, ${failed} that needed a fallback` };
    },
    async fix(ctx) {
      const who = [ctx.owner, ctx.employee, ctx.picker].filter(Boolean);
      const made = [];
      for (let i = 0; i < 36; i += 1) {
        const at = new Date(ctx.now.getTime() - (i * 17 + 2) * HOUR);
        const fell = i % 6 === 0;
        const user = who.length ? who[i % who.length] : null;
        made.push(await insert(AiUsage, {
          userId: user ? user._id : null,
          role: user ? user.role : null,
          agent: AGENT_NAMES[i % AGENT_NAMES.length],
          provider: fell ? null : 'openai',
          model: fell ? null : 'gpt-4o-mini',
          promptTokens: 380 + (i * 37) % 900,
          completionTokens: fell ? 0 : 90 + (i * 13) % 260,
          attempts: fell ? 2 + (i % 2) : 1,
          ms: 620 + (i * 131) % 2400,
          ok: !fell,
          error: fell ? 'provider timeout after the attempts were used up (AI demo fixture)' : null,
          createdAt: at, updatedAt: at,
        }));
      }
      return { ids: made.map((d) => d._id), note: '36 requests across 30 days, 6 of them fallen back' };
    },
  },
];

// Counted the way the agent counts: only complete Monday weeks, bucketed on the
// same epoch, so this probe can never disagree with the endpoint it is checking.
async function weekBuckets(ctx, count) {
  const weeks = completeWeeks(count, ctx.now);
  const rows = await Order.find({
    brandId: ctx.brandId,
    orderStatus: 'DELIVERED',
    updatedAt: { $gte: weeks[0].from, $lt: weeks[weeks.length - 1].to },
  }).select('updatedAt').lean();
  const seen = new Set(rows.map((row) => weekIndexOf(row.updatedAt)));
  return weeks.filter((week) => seen.has(week.index));
}

// "Sitting" in the agent's own sense: tracked stock, a live listing, and nothing sold in the window.
async function sittingCount(ctx, days) {
  const from = new Date(ctx.now.getTime() - days * DAY);
  const rows = await Inventory.aggregate([
    { $match: { brandId: ctx.brandId, quantity: { $gt: 0 }, trackInventory: true } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'p' } },
    { $match: { 'p.status': 'ACTIVE', 'p.isActive': true } },
    { $lookup: {
      from: 'orders',
      let: { pid: '$productId' },
      pipeline: [
        { $match: { brandId: ctx.brandId, orderStatus: 'DELIVERED', updatedAt: { $gte: from } } },
        { $unwind: '$items' },
        { $match: { $expr: { $eq: ['$items.productId', '$$pid'] } } },
        { $limit: 1 },
      ],
      as: 'sold',
    } },
    { $match: { sold: { $size: 0 } } },
  ]);
  return rows.length;
}

// ── reporting ───────────────────────────────────────────────────────────────
function readManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    return Array.isArray(parsed.runs) ? parsed : { runs: [] };
  } catch {
    return { runs: [] };
  }
}

function writeManifest(entry) {
  const manifest = readManifest();
  manifest.runs.push(entry);
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

// Undo reads ONLY the ids this script recorded. It is scoped to those ids: nothing here
// deletes by a broad filter, and the marketplace rows written by the seeds are never touched.
async function undo() {
  const manifest = readManifest();
  const ids = [...new Set(manifest.runs.flatMap((run) => run.ids))];
  if (!ids.length) {
    console.log('This script has recorded nothing, so there is nothing to undo.');
    return;
  }
  console.log(`Removing the ${ids.length} id(s) this script recorded across ${manifest.runs.length} run(s).`);
  const targets = [
    [Product, '_id'], [Inventory, '_id'], [Review, '_id'], [Order, '_id'],
    [Conversation, '_id'], [Message, '_id'], [CatalogProduct, '_id'],
    [AiUsage, '_id'], [BillingHelp, '_id'], [Address, '_id'],
  ];
  let removed = 0;
  for (const [Model, key] of targets) {
    const result = await Model.deleteMany({ [key]: { $in: ids } });
    removed += result.deletedCount;
    if (result.deletedCount) console.log(`  ${Model.modelName.padEnd(16)} ${result.deletedCount}`);
  }
  fs.unlinkSync(MANIFEST);
  console.log(`${removed} document(s) gone, manifest cleared. Seed data untouched.`);
  console.log('Two things this script edits rather than writes, so they stay: the brand delivery promise on '
    + 'Brand.settings and the service provider working windows. Both are ordinary settings you can change in the UI.');
}

async function repointDeadImages(ctx) {
  const rows = await Product.find({ brandId: ctx.brandId, images: CLOUDINARY_RE }).select('name images').lean();
  let changed = 0;
  for (const row of rows) {
    const images = row.images.map((url, i) => (ctx.deadImages.has(url) ? photo(row.name, i + 1) : url));
    if (images.every((url, i) => url === row.images[i])) continue;
    await Product.updateOne({ _id: row._id }, { $set: { images } });
    changed += 1;
  }
  return `${changed} listing(s) repointed away from photos Cloudinary no longer serves`;
}

function table(rows) {
  const width = Math.max(...rows.map((r) => r.label.length), 12);
  const lines = [`${'AI FEATURE'.padEnd(width)}  STATE        WHAT THE SHOP HOLDS TODAY`, '-'.repeat(width + 50)];
  for (const row of rows) {
    lines.push(`${row.label.padEnd(width)}  ${row.mark.padEnd(11)}  ${row.note}`);
  }
  return lines.join('\n');
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (server/.env).');

  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const brandFlag = (argv.find((a) => a.startsWith('--brand=')) || '').replace(/^--brand=/, '').replace(/^["']|["']$/g, '') || null;

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Database: ${mongoose.connection.name} — ${apply ? 'WRITING the missing fixtures' : 'read-only, nothing will be written'}`);

  if (argv.includes('--undo')) return undo();

  const ctx = await resolveContext({ brandFlag });
  ctx.apply = false; // the probe pass below reads only, even when --apply was asked for
  console.log(`Tenant: ${ctx.brand.name}${ctx.brand.billingStatus && ctx.brand.billingStatus !== 'NONE' ? ` (billing ${ctx.brand.billingStatus})` : ''}`);
  console.log(`Sign in as: ${ctx.owner ? `brand owner ${ctx.owner.email}` : 'NO brand owner found'}`
    + `${ctx.employee ? ` · staff ${ctx.employee.email}` : ''}${ctx.picker ? ` · picker ${ctx.picker.email}` : ' · NO picker'}`);
  if (ctx.staleImages) {
    console.log(`Note: ${ctx.staleImages} listing(s) point at photos Cloudinary no longer serves — add --images to --apply to repoint them.`);
  }
  console.log('');

  // First pass: what does the shop hold today, before anything is written.
  const probeListings = {};
  for (const def of LISTINGS) probeListings[def.key] = await listing(ctx, def);
  const before = [];
  for (const feature of FEATURES) {
    const state = await feature.check(ctx, probeListings);
    before.push({ label: feature.label, note: state.note, ready: state.ready });
  }

  const gaps = before.filter((row) => !row.ready);
  if (!apply) {
    console.log(table(before.map((row) => ({ ...row, mark: row.ready ? 'yes' : 'no' }))));
    console.log(`\n${gaps.length} of ${FEATURES.length} features need fixtures.`);
    console.log(gaps.length ? 'Run the same command with --apply to add them.' : 'Nothing to add: every AI feature can be demoed as it stands.');
    return;
  }

  // Second pass: write. The listings and their orders come first, because the review,
  // substitution and calendar fixtures are filed against them.
  ctx.apply = true;
  const written = [];
  const L = {};
  for (const def of LISTINGS) {
    L[def.key] = await listing(ctx, def);
    if (L[def.key].isNew) written.push(L[def.key].product._id, L[def.key].inventory._id, L[def.key].catalog._id);
  }
  const newListings = LISTINGS.filter((def) => L[def.key].isNew);
  console.log(`${newListings.length} demo listing(s) created, ${LISTINGS.length - newListings.length} already present.`);

  const promise = parsePromise(ctx.brand.settings && ctx.brand.settings.estimatedDeliveryTime);
  if (!promise.minutes) {
    await Brand.updateOne({ _id: ctx.brandId }, { $set: { 'settings.estimatedDeliveryTime': '2-3 days' } });
    ctx.brand.settings = { ...(ctx.brand.settings || {}), estimatedDeliveryTime: '2-3 days' };
    console.log('Delivery promise: wrote estimatedDeliveryTime = "2-3 days" on this brand (its settings held no readable timeframe).');
  }

  // Orders behind the slow listings: one sale at the age that puts each on its own price rung.
  const soldAgo = LISTINGS.filter((def) => def.soldAgo);
  for (const def of soldAgo) {
    if (await Order.countDocuments({ brandId: ctx.brandId, 'items.productId': L[def.key].product._id })) continue;
    const order = await deliveredOrder(ctx, {
      deliveredAt: new Date(ctx.now.getTime() - def.soldAgo * DAY),
      lines: [{ product: L[def.key].product, quantity: 2 }],
      weekLabel: `last sold ${def.soldAgo} days ago`,
    });
    written.push(order._id);
  }

  const after = [];
  for (const feature of FEATURES) {
    const state = await feature.check(ctx, L);
    if (!state.ready) {
      const result = await feature.fix(ctx, L);
      const ids = result.ids || [];
      written.push(...ids);
      after.push({
        label: feature.label,
        mark: ids.length ? 'written' : 'no rows',
        note: result.note || state.note,
      });
    } else {
      after.push({ label: feature.label, mark: 'yes', note: state.note });
    }
  }

  if (argv.includes('--images')) console.log(`Photos: ${await repointDeadImages(ctx)}.`);

  if (written.length) {
    writeManifest({
      at: new Date().toISOString(),
      database: mongoose.connection.name,
      brandId: String(ctx.brandId),
      ids: written.map(String),
    });
  }
  console.log('');
  console.log(table(after));
  console.log(written.length
    ? `\n${written.length} document(s) recorded in ${path.relative(process.cwd(), MANIFEST)}.`
    : '\nNothing new to record: the shop already held everything the endpoints ask for.');
  console.log('"node scripts/seedAiFixtures.js --undo" removes exactly those and nothing else.');
  console.log('\nThe brand, picker and customer accounts are already signed in from the seed login sheet; no restart is needed.');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\nFixture run failed: ${err.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { FEATURES, LISTINGS, insert, listing, deliveredOrder, weekBuckets, sittingCount };
