/**
 * Turns ./catalog.js into database-ready documents. Pure: no database access, no clock reads
 * other than the `now` it is given, and a seeded random generator, so the same input always
 * produces the same shape of data. The runner (../seedDemo.js) inserts the result, and
 * tests/seedDemo.test.js validates it against the real Mongoose schemas.
 */
const mongoose = require('mongoose');

const { slugify } = require('../../src/utils/slugify');
const { innerPoint, toGeoJsonPolygon, ringFromGeoJson, pointInRing } = require('../../src/utils/polygon');
const { computeBlockIds } = require('../../src/utils/blockMembership');
const { PAYMENT_METHOD_FOR_COLLECTION } = require('../../src/config/paymentCollection');
const { STORE_FAULT_REASONS } = require('../../src/config/returns');
const { CITIES, BLOCKS, BRANCHES, BRANDS, CHATS, LONG_CHAT, CUSTOMERS, ADMIN, CARTS, REMARKS } = require('./catalog');
const { karachiDateKey, karachiMonthKey, startOfKarachiMonth } = require('../../src/utils/karachiTime');

const { ObjectId } = mongoose.Types;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// ── small helpers ────────────────────────────────────────────────────────────
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money = (n) => `PKR ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const pad = (n, width) => String(n).padStart(width, '0');

// Photo links. Default: picsum.photos (always available, but the photos are random and do not
// match the product). SEED_IMAGES=keyword switches to loremflickr.com, which picks photos by
// keyword (more relevant, but slower and less predictable).
function photo(keyword, n, width = 900, height = 1100) {
  if (process.env.SEED_IMAGES === 'keyword') {
    return `https://loremflickr.com/${width}/${height}/${keyword.replace(/\s+/g, '')}?lock=${n}`;
  }
  const seed = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `https://picsum.photos/seed/${seed}-${n}/${width}/${height}`;
}

const BACKGROUNDS = ['1e3a2f', 'b6472a', '231c16', '6f6256', '3b5b7c', '7a4b8c', '8a5a2b'];
function monogram(name, size = 256) {
  const bg = BACKGROUNDS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % BACKGROUNDS.length];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fdf5ed&size=${size}&bold=true&format=png`;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function businessHours({ open, close, closed }) {
  return Object.fromEntries(DAYS.map((day) => [day, closed.includes(day) ? 'Closed' : `${open} to ${close}`]));
}

// One picker for each active demo brand (docs/22 §E): a brand account that
// signs in on the partner app and only sees the pick queue.
const PICKERS = {
  loom: { name: 'Areeba Saleem', email: 'areeba.saleem@citycart.demo', phone: '+92 321 4487001' },
  rangrez: { name: 'Fahad Iqbal', email: 'fahad.iqbal@citycart.demo', phone: '+92 302 7738190' },
  mehr: { name: 'Nimra Aslam', email: 'nimra.aslam@citycart.demo', phone: '+92 345 6102287' },
  sukoon: { name: 'Tahir Mehmood', email: 'tahir.mehmood@citycart.demo', phone: '+92 311 9054326' },
  zaitoon: { name: 'Rabia Sattar', email: 'rabia.sattar@citycart.demo', phone: '+92 312 6680142' },
  naqsh: { name: 'Waleed Akhtar', email: 'waleed.akhtar@citycart.demo', phone: '+92 301 3397650' },
};

// One brand in each stage of the billing ladder (docs/15 §9), so the demo shows
// a warning, a restricted seller, a frozen seller and a granted grace period.
const BILLING_STATE = {
  loom: { status: 'WARNING' },
  rangrez: { status: 'RESTRICTED' },
  sukoon: { status: 'FROZEN' },
  zaitoon: { status: 'ACTIVE', graceDays: 5 },
};

// ── the builder ──────────────────────────────────────────────────────────────
function buildDataset({ now = new Date(), hashes }) {
  const random = makeRandom(20260501);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (min, max) => min + random() * (max - min);
  const intBetween = (min, max) => Math.floor(between(min, max + 1));
  const ago = (ms) => new Date(now.getTime() - ms);

  const ds = {
    cities: [], blocks: [], branches: [], conversations: [], messages: [], users: [], brands: [], stores: [], categories: [], catalogProducts: [], addresses: [], products: [], inventories: [],
    employees: [], carts: [], orders: [], payments: [], receipts: [], deliveries: [], returns: [], orderAdjustments: [], inventoryMovements: [],
    reviews: [], notifications: [], counters: [],
    serviceCategories: [], serviceProviders: [], serviceOfferings: [], serviceAvailabilities: [],
    serviceBookings: [], serviceConversations: [], serviceMessages: [], serviceReviews: [],
    commissionEntries: [], sellerInvoices: [], sellerPaymentClaims: [], billingHelpRequests: [],
  };

  // ── cities ──
  const cityByKey = {};
  for (const c of CITIES) {
    const doc = {
      _id: new ObjectId(), name: c.name, slug: slugify(c.name), state: c.state, country: c.country,
      description: c.description, image: photo(`${c.name} city`, 1, 1200, 700), isActive: c.isActive,
      createdAt: ago(300 * DAY), updatedAt: ago(300 * DAY),
    };
    cityByKey[c.key] = doc;
    ds.cities.push(doc);
  }

  // ── blocks (neighbourhoods, all in Faisalabad) ──
  const faisalabad = cityByKey.faisalabad;
  const blockBySlug = {};
  for (const blk of BLOCKS) {
    // Each block has a drawn boundary; its centre is a point guaranteed to be inside it.
    const inside = innerPoint(blk.polygon);
    const doc = {
      _id: new ObjectId(), cityId: faisalabad._id, name: blk.name, slug: slugify(blk.name),
      center: { type: 'Point', coordinates: [Math.round(inside.lng * 1e6) / 1e6, Math.round(inside.lat * 1e6) / 1e6] },
      area: toGeoJsonPolygon(blk.polygon), isActive: true,
      createdAt: ago(290 * DAY), updatedAt: ago(290 * DAY),
    };
    blockBySlug[doc.slug] = doc;
    ds.blocks.push(doc);
  }

  // ── users ──
  const userDoc = ({ name, email, phone, role, passwordHash, brandId, createdAt, isActive = true, restrictedUntil }) => ({
    _id: new ObjectId(), name, email, passwordHash, role,
    accountType:
      role === 'CUSTOMER'
        ? 'CUSTOMER'
        : role === 'SUPER_ADMIN' || role === 'ADMIN_PARTNER'
          ? 'PLATFORM_ADMIN'
          : role === 'SERVICE_PROVIDER'
            ? 'SERVICE'
            : 'BRAND',
    ...(brandId && { brandId }), phone,
    avatar: monogram(name, 240), isActive, passwordVersion: 0, mustChangePassword: false,
    // Demo accounts are pre-existing: they can sign in without a verification email.
    emailVerifiedAt: createdAt,
    ...(restrictedUntil && { accessRestricted: true, accessExpiresAt: restrictedUntil }),
    createdAt, updatedAt: createdAt,
  });

  const admin = userDoc({ ...ADMIN, role: 'SUPER_ADMIN', passwordHash: hashes.admin, createdAt: ago(320 * DAY) });
  ds.users.push(admin);

  const customers = CUSTOMERS.map((c, i) => {
    const doc = userDoc({
      name: c.name, email: c.email, phone: c.phone, role: 'CUSTOMER', passwordHash: hashes.demo,
      createdAt: ago((90 + (i * 17) % 190) * DAY), isActive: !c.inactive,
    });
    ds.users.push(doc);
    return { ...c, doc };
  });

  const shoppers = customers.filter((c) => c.doc.isActive); // deactivated accounts do not place new orders

  // ── saved addresses: every customer has a pin inside one of the blocks ──
  const ringOfBlock = new Map(ds.blocks.map((b) => [String(b._id), ringFromGeoJson(b.area)]));
  const blocksHolding = (lat, lng) => ds.blocks.filter((b) => b.isActive && pointInRing(lat, lng, ringOfBlock.get(String(b._id)))).map((b) => b._id);
  // Streets that are not in one of the nine drawn blocks are placed in the nearest one.
  const NEAREST_BLOCK = { 'Gulistan Colony': 'Peoples Colony', 'Civil Lines': 'Clock Tower', 'Canal Road': 'Gulberg' };
  const pinIn = (block, step) => {
    const [lng, lat] = block.center.coordinates;
    const near = [lat + ((step * 37) % 5 - 2) * 0.0005, lng + ((step * 53) % 5 - 2) * 0.0005];
    return blocksHolding(near[0], near[1]).some((id) => String(id) === String(block._id)) ? near : [lat, lng];
  };
  customers.forEach((c, i) => {
    const named = ds.blocks.find((b) => c.address.includes(b.name));
    const fallback = Object.keys(NEAREST_BLOCK).find((k) => c.address.includes(k));
    const block = named || ds.blocks.find((b) => b.name === NEAREST_BLOCK[fallback]);
    const [lat, lng] = pinIn(block, i);
    c.pin = { type: 'Point', coordinates: [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6] };
    c.blockIds = blocksHolding(lat, lng);
    const made = new Date(c.doc.createdAt.getTime() + DAY);
    const home = {
      _id: new ObjectId(), userId: c.doc._id, label: 'Home', fullName: c.name, phone: c.phone, addressLine: c.address,
      city: c.city, state: c.state, postalCode: c.postalCode, country: 'Pakistan',
      ...(c.note && { additionalInstructions: c.note }), location: c.pin, isDefault: true, createdAt: made, updatedAt: made,
    };
    c.addressId = home._id;
    ds.addresses.push(home);
    // The first few customers also saved a second address in another block (an office),
    // which is how a customer shops for a block other than the one they live in.
    if (i < 3) {
      const office = ds.blocks[(ds.blocks.indexOf(block) + 3) % ds.blocks.length];
      const [olat, olng] = pinIn(office, i + 7);
      ds.addresses.push({
        _id: new ObjectId(), userId: c.doc._id, label: 'Work', fullName: c.name, phone: c.phone, addressLine: `Office 2, ${office.name} Main Road`,
        city: c.city, state: c.state, postalCode: c.postalCode, country: 'Pakistan',
        location: { type: 'Point', coordinates: [Math.round(olng * 1e6) / 1e6, Math.round(olat * 1e6) / 1e6] },
        isDefault: false, createdAt: new Date(made.getTime() + 3 * DAY), updatedAt: new Date(made.getTime() + 3 * DAY),
      });
    }
  });

  // ── service providers (their own tenant, docs/24 §4) ──
  const serviceCategoryDefs = [
    { name: 'Home Cleaning', slug: 'home-cleaning' },
    { name: 'Deep Cleaning', slug: 'deep-cleaning', parent: 'home-cleaning' },
    { name: 'Plumbing', slug: 'plumbing' },
    { name: 'Electrical', slug: 'electrical' },
  ];
  const serviceCategoryBySlug = {};
  serviceCategoryDefs.forEach((def, order) => {
    const doc = {
      _id: new ObjectId(), name: def.name, slug: def.slug, order, isActive: true,
      parentId: def.parent ? serviceCategoryBySlug[def.parent]._id : null,
      image: photo(`service category ${def.name}`, order + 20, 600, 400),
      createdAt: ago(210 * DAY), updatedAt: ago(210 * DAY),
    };
    ds.serviceCategories.push(doc);
    serviceCategoryBySlug[def.slug] = doc;
  });

  const serviceBlock = ds.blocks.find((b) => b.slug === 'peoples-colony') || ds.blocks[0];
  const serviceOwner = userDoc({
    name: 'Sana Khalid', email: 'service@citycart.local', phone: '+92 300 1234567',
    role: 'SERVICE_PROVIDER', passwordHash: hashes.demo, createdAt: ago(190 * DAY),
  });
  ds.users.push(serviceOwner);

  const providerMade = ago(185 * DAY);
  const provider = {
    _id: new ObjectId(), userId: serviceOwner._id, displayName: 'Sana Home Cleaning',
    legalName: 'Sana Home Cleaning Services', slug: 'sana-home-cleaning-demo',
    categoryId: serviceCategoryBySlug['home-cleaning']._id, cityId: faisalabad._id, blockId: serviceBlock._id,
    location: { type: 'Point', coordinates: [...serviceBlock.center.coordinates] },
    addressLine: 'House 12, Street 4, Peoples Colony No. 1', phone: '+92 300 1234567',
    bio: 'Reliable home cleaning in Faisalabad — deep cleans, sofas and move-in jobs.',
    avatar: photo('cleaner', 4, 300, 300), coverImage: photo('clean house', 5, 1600, 500),
    startingAtPrice: 250000, status: 'ACTIVE', verification: 'VERIFIED',
    ratingAvg: 4.5, ratingCount: 2, completedBookings: 18, rankScore: 0.72,
    rankInputs: { windowDays: 90, ratingAvg: 4.5, reviewCount: 2, computedAt: ago(2 * DAY) },
    rankingUpdatedAt: ago(2 * DAY), billingStatus: 'ACTIVE', billingCheckedAt: ago(DAY),
    billingGraceUntil: new Date(now.getTime() + 4 * DAY),
    billingGraceReason: 'First invoice; the super admin allowed extra time to set up the transfer.',
    billingGraceBy: admin._id,
    customerLateCancelMonth: karachiMonthKey(now), customerLateCancelCount: 1,
    blockChangedAt: ago(160 * DAY),
    blockHistory: [{ blockId: serviceBlock._id, changedAt: providerMade, changedBy: admin._id }],
    approvedBy: admin._id, approvedAt: providerMade, createdAt: providerMade, updatedAt: ago(2 * DAY),
  };
  ds.serviceProviders.push(provider);

  const pendingOwner = userDoc({
    name: 'Bilal Ahmed', email: 'bilal.plumbing@citycart.demo', phone: '+92 301 7788120',
    role: 'SERVICE_PROVIDER', passwordHash: hashes.demo, createdAt: ago(18 * DAY),
  });
  ds.users.push(pendingOwner);
  const pendingProvider = {
    _id: new ObjectId(), userId: pendingOwner._id, displayName: 'Bilal Plumbing Works',
    legalName: 'Bilal Plumbing Works', slug: 'bilal-plumbing-works',
    categoryId: serviceCategoryBySlug.plumbing._id, cityId: faisalabad._id, blockId: serviceBlock._id,
    location: { type: 'Point', coordinates: [...serviceBlock.center.coordinates] },
    addressLine: 'Shop 3, Peoples Colony No. 1 Market', phone: '+92 301 7788120',
    bio: 'Leak repairs, taps, water tanks and bathroom fittings.',
    avatar: photo('plumber', 6, 300, 300), coverImage: photo('plumbing tools', 7, 1600, 500),
    startingAtPrice: 80000, status: 'PENDING', verification: 'UNVERIFIED',
    ratingAvg: 0, ratingCount: 0, completedBookings: 0, rankScore: 0,
    rankInputs: { windowDays: 90, ratingAvg: 0, reviewCount: 0, newProvider: true, computedAt: ago(18 * DAY) },
    rankingUpdatedAt: ago(18 * DAY),
    billingStatus: 'ACTIVE', billingCheckedAt: ago(5 * DAY),
    billingOverride: {
      status: 'ACTIVE', reason: 'Pilot provider; billing reviewed by hand while it is onboarded.',
      until: new Date(now.getTime() + 30 * DAY), by: admin._id, at: ago(5 * DAY),
    },
    blockChangedAt: ago(18 * DAY),
    blockHistory: [{ blockId: serviceBlock._id, changedAt: ago(18 * DAY), changedBy: pendingOwner._id }],
    createdAt: ago(18 * DAY), updatedAt: ago(18 * DAY),
  };
  ds.serviceProviders.push(pendingProvider);

  const offeringDefs = [
    {
      title: 'Deep clean — 2 bedroom', slug: 'deep-clean-2-bedroom', startingAtPrice: 450000,
      durationMinutes: 180, description: 'Full deep clean of a two-bedroom home, including bathrooms and kitchen.',
    },
    {
      title: 'Sofa shampoo', slug: 'sofa-shampoo', startingAtPrice: 180000,
      durationMinutes: 90, description: 'Up to five seats, machine shampoo and quick dry.',
    },
    {
      title: 'Move-in deep clean', slug: 'move-in-deep-clean', startingAtPrice: 800000,
      durationMinutes: 300, description: 'Empty-home clean before you move in, kitchen and bathrooms included.',
    },
  ];
  const offerings = offeringDefs.map((def, index) => {
    const doc = {
      _id: new ObjectId(), providerId: provider._id, categoryId: provider.categoryId,
      title: def.title, slug: def.slug, description: def.description,
      images: [photo(`home cleaning ${index + 1}`, index + 8, 900, 600)],
      startingAtPrice: def.startingAtPrice, durationMinutes: def.durationMinutes,
      attributes: index === 0 ? { bedrooms: 2, bathrooms: 2 } : index === 1 ? { seats: 5 } : { bedrooms: 3, emptyHome: true },
      isActive: true, createdAt: providerMade, updatedAt: providerMade,
    };
    ds.serviceOfferings.push(doc);
    return doc;
  });
  ds.serviceOfferings.push({
    _id: new ObjectId(), providerId: pendingProvider._id, categoryId: pendingProvider.categoryId,
    title: 'Tap and leak repair', slug: 'tap-and-leak-repair',
    description: 'Fix a dripping tap or a leaking joint, parts extra.',
    images: [photo('plumbing repair', 11, 900, 600)], startingAtPrice: 80000,
    durationMinutes: 60, attributes: { fittings: 'standard', partsExtra: true }, isActive: true,
    createdAt: ago(18 * DAY), updatedAt: ago(18 * DAY),
  });

  ds.serviceAvailabilities.push({
    _id: new ObjectId(), providerId: provider._id,
    windows: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080, slotMinutes: 60 })),
    blackoutDates: [karachiDateKey(new Date(now.getTime() + 21 * DAY))],
    createdAt: providerMade, updatedAt: ago(2 * DAY),
  });

  const SERVICE_OFFERING = offerings[0];
  const serviceAddress = (customer) => {
    const block = ds.blocks.find((b) => String(b._id) === String(customer.blockIds[0])) || serviceBlock;
    return {
      fullName: customer.name, phone: customer.phone, addressLine: customer.address,
      city: customer.city, blockId: block._id, blockName: block.name, location: customer.pin,
    };
  };
  let serviceBookingSeq = 0;
  const addServiceBooking = ({ customer, offering = SERVICE_OFFERING, status, at, start, over = {} }) => {
    serviceBookingSeq += 1;
    const doc = {
      _id: new ObjectId(),
      bookingNumber: `SB-${now.getUTCFullYear()}-${pad(serviceBookingSeq, 6)}`,
      customerId: customer.doc._id, providerId: provider._id,
      offering: {
        offeringId: offering._id, title: offering.title, slug: offering.slug,
        durationMinutes: offering.durationMinutes, startingAtPrice: offering.startingAtPrice,
        image: offering.images[0],
      },
      status, requestedStart: start, address: serviceAddress(customer),
      events: [{ type: status, byRole: 'SYSTEM', at }],
      createdAt: at, updatedAt: at,
      ...over,
    };
    ds.serviceBookings.push(doc);
    return doc;
  };

  const requestedService = addServiceBooking({
    customer: customers[0], status: 'REQUESTED', at: ago(2 * HOUR), start: new Date(now.getTime() + 2 * DAY + 3 * HOUR),
    over: { note: 'Please bring your own supplies.' },
  });
  const proposedService = addServiceBooking({
    customer: customers[1], status: 'PROPOSED', at: ago(6 * HOUR), start: new Date(now.getTime() + 3 * DAY + 4 * HOUR),
    over: {
      proposals: [{
        pricePaisa: 480000, scope: 'Two bedrooms, kitchen and both bathrooms; supplies included.',
        scheduledStart: new Date(now.getTime() + 3 * DAY + 4 * HOUR),
        scheduledEnd: new Date(now.getTime() + 3 * DAY + 7 * HOUR),
        expiresAt: new Date(now.getTime() + 18 * HOUR), status: 'ACTIVE', createdAt: ago(6 * HOUR),
      }],
    },
  });
  const acceptedService = addServiceBooking({
    customer: customers[2], status: 'ACCEPTED', at: ago(DAY), start: new Date(now.getTime() + 4 * DAY + 2 * HOUR),
    over: {
      scheduledStart: new Date(now.getTime() + 4 * DAY + 2 * HOUR),
      scheduledEnd: new Date(now.getTime() + 4 * DAY + 5 * HOUR),
      agreedPricePaisa: 500000, acceptedAt: ago(DAY),
    },
  });
  addServiceBooking({
    customer: customers[3], status: 'IN_PROGRESS', at: ago(3 * DAY), start: ago(2 * HOUR),
    over: {
      scheduledStart: ago(2 * HOUR), scheduledEnd: new Date(now.getTime() + 1 * HOUR),
      agreedPricePaisa: 460000, acceptedAt: ago(3 * DAY), startedAt: ago(2 * HOUR),
    },
  });
  addServiceBooking({
    customer: customers[4], status: 'COMPLETED', at: ago(2 * DAY), start: ago(DAY),
    over: {
      scheduledStart: ago(DAY), scheduledEnd: ago(DAY), agreedPricePaisa: 470000,
      finalAmountPaisa: 470000, completionNote: 'Extra balcony cleaned at no charge.',
      acceptedAt: ago(2 * DAY), startedAt: ago(DAY), completedAt: ago(6 * HOUR),
      autoConfirmAt: new Date(now.getTime() + 2 * DAY - 6 * HOUR),
    },
  });
  const confirmedService = addServiceBooking({
    customer: customers[5], status: 'CONFIRMED', at: ago(12 * DAY), start: ago(10 * DAY),
    over: {
      scheduledStart: ago(10 * DAY), scheduledEnd: ago(10 * DAY), agreedPricePaisa: 440000,
      finalAmountPaisa: 440000, acceptedAt: ago(12 * DAY), startedAt: ago(10 * DAY),
      completedAt: ago(9 * DAY), confirmedAt: ago(8 * DAY), confirmedBy: 'CUSTOMER',
    },
  });
  addServiceBooking({
    customer: customers[6], status: 'CONFIRMED', at: ago(7 * DAY), start: ago(5 * DAY),
    over: {
      scheduledStart: ago(5 * DAY), scheduledEnd: ago(5 * DAY), agreedPricePaisa: 460000,
      finalAmountPaisa: 460000, acceptedAt: ago(7 * DAY), startedAt: ago(5 * DAY),
      completedAt: ago(4 * DAY), confirmedAt: ago(3 * DAY), confirmedBy: 'AUTO',
    },
  });
  addServiceBooking({
    customer: customers[7], status: 'DISPUTED', at: ago(4 * DAY), start: ago(3 * DAY),
    over: {
      scheduledStart: ago(3 * DAY), scheduledEnd: ago(3 * DAY), agreedPricePaisa: 480000,
      finalAmountPaisa: 520000, acceptedAt: ago(4 * DAY), startedAt: ago(3 * DAY),
      completedAt: ago(2 * DAY), dispute: { reason: 'The agreed amount was PKR 4,800, not PKR 5,200.', at: ago(DAY) },
    },
  });
  addServiceBooking({
    customer: customers[8], status: 'CANCELLED', at: ago(2 * DAY), start: ago(DAY),
    over: {
      scheduledStart: ago(DAY), scheduledEnd: ago(DAY), agreedPricePaisa: 450000, acceptedAt: ago(2 * DAY),
      cancellation: { by: 'CUSTOMER', reason: 'Family emergency.', late: true, at: ago(DAY) },
    },
  });
  addServiceBooking({
    customer: customers[9], status: 'DECLINED', at: ago(5 * DAY), start: new Date(now.getTime() + 6 * DAY),
    over: {
      proposals: [{
        pricePaisa: 490000, scope: 'Whole house including two balconies.',
        scheduledStart: new Date(now.getTime() + 6 * DAY),
        scheduledEnd: new Date(now.getTime() + 6 * DAY + 3 * HOUR),
        expiresAt: ago(4 * DAY), status: 'DECLINED', createdAt: ago(5 * DAY),
      }],
    },
  });
  // One dispute that the admin already settled, so the resolution path has data too.
  addServiceBooking({
    customer: customers[0], status: 'CONFIRMED', at: ago(9 * DAY), start: ago(8 * DAY),
    over: {
      scheduledStart: ago(8 * DAY), scheduledEnd: ago(8 * DAY), agreedPricePaisa: 430000,
      finalAmountPaisa: 430000, acceptedAt: ago(9 * DAY), startedAt: ago(8 * DAY),
      completedAt: ago(7 * DAY), confirmedAt: ago(6 * DAY), confirmedBy: 'ADMIN',
      dispute: {
        reason: 'Customer believed the balcony was skipped.', at: ago(7 * DAY),
        resolvedAt: ago(6 * DAY), resolution: 'CONFIRMED', resolvedBy: admin._id,
        resolutionNote: 'Provider sent photographs showing the balcony cleaned.',
      },
      events: [
        {
          type: 'REQUESTED', by: customers[0].doc._id, byRole: 'CUSTOMER', at: ago(9 * DAY),
          note: 'Please also cover the balcony.', meta: { offeringSlug: SERVICE_OFFERING.slug },
        },
        {
          type: 'CONFIRMED', by: admin._id, byRole: 'ADMIN', at: ago(6 * DAY),
          note: 'Dispute resolved in the provider’s favour.',
        },
      ],
    },
  });

  const serviceConversation = {
    _id: new ObjectId(), bookingId: acceptedService._id, customerId: acceptedService.customerId,
    providerId: provider._id, lastMessageAt: ago(3 * HOUR),
    lastMessagePreview: 'I will bring the extra brushes for the balcony.', lastSenderRole: 'PROVIDER',
    customerUnread: 1, providerUnread: 0, createdAt: ago(DAY), updatedAt: ago(3 * HOUR),
  };
  ds.serviceConversations.push(serviceConversation);
  acceptedService.conversationId = serviceConversation._id;
  [
    { senderRole: 'SYSTEM', body: 'Booking accepted. You can chat here about the job.', at: ago(DAY) },
    { senderRole: 'CUSTOMER', senderId: customers[2].doc._id, body: 'Please also do the balcony if there is time.', at: ago(5 * HOUR), attachments: [photo('balcony before cleaning', 12, 900, 600)] },
    { senderRole: 'PROVIDER', senderId: serviceOwner._id, body: 'I will bring the extra brushes for the balcony.', at: ago(3 * HOUR) },
  ].forEach((m) => {
    ds.serviceMessages.push({
      _id: new ObjectId(), conversationId: serviceConversation._id, senderRole: m.senderRole,
      ...(m.senderId && { senderId: m.senderId }), body: m.body,
      attachments: m.attachments || [], createdAt: m.at,
    });
  });

  ds.serviceReviews.push({
    _id: new ObjectId(), bookingId: confirmedService._id, customerId: confirmedService.customerId,
    providerId: provider._id, rating: 5,
    comment: 'The team arrived on time, cleaned every corner and left the kitchen spotless.',
    providerReply: { body: 'Thank you! We are glad the kitchen came up so well.', at: ago(7 * DAY) },
    isApproved: true, createdAt: ago(8 * DAY), updatedAt: ago(7 * DAY),
  });
  ds.serviceReviews.push({
    _id: new ObjectId(), bookingId: ds.serviceBookings[6]._id, customerId: ds.serviceBookings[6].customerId,
    providerId: provider._id, rating: 4,
    comment: 'Good work overall; they had to come back for one bathroom.',
    isApproved: true, createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY),
  });

  // ── brands, stores, categories, products, inventory, staff ──
  const brands = [];
  const globalCategoryByKey = new Map();
  const catalogBySlug = new Map();
  for (const b of BRANDS) {
    const createdAt = ago(b.ageDays * DAY);
    const brandId = new ObjectId();
    const terminatedAt = b.status === 'TERMINATED' ? ago(b.terminatedDaysAgo * DAY) : undefined;
    const accessEndsAt = terminatedAt ? new Date(terminatedAt.getTime() + b.graceHours * HOUR) : undefined;

    const brandDoc = {
      _id: brandId, name: b.name, slug: slugify(b.name), description: b.description,
      logo: monogram(b.name), coverImage: photo(`${b.key} cover`, 1, 1600, 600), cityId: cityByKey[b.city]._id,
      status: b.status, contact: b.contact, settings: b.settings, createdAt, updatedAt: createdAt,
      ...(BILLING_STATE[b.key] && {
        billingStatus: BILLING_STATE[b.key].status,
        billingCheckedAt: ago(2 * DAY),
        ...(BILLING_STATE[b.key].graceDays && {
          billingGraceUntil: new Date(now.getTime() + BILLING_STATE[b.key].graceDays * DAY),
          billingGraceReason: 'Bank transfer delayed; the super admin granted a short grace period.',
          billingGraceBy: admin._id,
        }),
      }),
      ...(b.key === 'sukoon' && {
        billingOverride: {
          status: 'FROZEN', reason: 'No payment received after repeated reminders.',
          until: new Date(now.getTime() + 30 * DAY), by: admin._id, at: ago(3 * DAY),
        },
      }),
      ...(terminatedAt && { terminationReason: b.terminationReason, terminatedAt, terminatedBy: admin._id, accessEndsAt }),
    };
    ds.brands.push(brandDoc);

    const restrictedUntil = accessEndsAt && accessEndsAt > now ? accessEndsAt : undefined;
    const owner = userDoc({
      name: b.owner.name, email: b.owner.email, phone: b.owner.phone, role: 'BRAND_ADMIN',
      passwordHash: hashes[b.owner.pw], brandId, createdAt, restrictedUntil,
    });
    ds.users.push(owner);

    const storeDoc = {
      _id: new ObjectId(), brandId, name: b.store.name, slug: slugify(b.store.name), description: b.store.description,
      address: b.store.address, contact: b.store.contact, businessHours: businessHours(b.store.hours),
      logo: monogram(b.store.name), banner: photo(`${b.key} store`, 2, 1600, 500), isActive: b.store.isActive,
      createdAt, updatedAt: createdAt,
    };
    ds.stores.push(storeDoc);

    // Branches: each shop of the brand, in one block, with its own pin.
    const branchDefs = BRANCHES[b.key] || [];
    const branchDocs = branchDefs.map((br, i) => {
      const block = blockBySlug[br.block];
      const [dLat, dLng] = br.off;
      const [lng, lat] = block.center.coordinates;
      const made = new Date(createdAt.getTime() + (1 + i) * DAY);
      const location = { type: 'Point', coordinates: [Math.round((lng + dLng) * 1e6) / 1e6, Math.round((lat + dLat) * 1e6) / 1e6] };
      const doc = {
        _id: new ObjectId(), brandId, blockId: block._id, blockIds: computeBlockIds(location, block._id, ds.blocks),
        name: br.name, address: br.address, phone: br.phone, location,
        isActive: br.isActive !== false, createdAt: made, updatedAt: made,
      };
      ds.branches.push(doc);
      return { def: br, doc };
    });

    // Categories are GLOBAL (one tree for the platform). Each brand's category keys
    // map onto shared documents, merged by "parent > name", so two brands that both
    // sell in "Lawn Collection" use the very same category.
    const categoryByKey = {};
    for (const c of b.categories) {
      const parentName = c.parent ? b.categories.find((x) => x.key === c.parent).name : '';
      const globalKey = `${parentName}>${c.name}`;
      let doc = globalCategoryByKey.get(globalKey);
      if (!doc) {
        doc = {
          _id: new ObjectId(), name: c.name, slug: slugify(c.name), description: c.description,
          image: photo(`${b.key} ${c.key}`, 3, 800, 600), parentId: c.parent ? categoryByKey[c.parent]._id : null,
          order: ds.categories.length, isActive: c.isActive !== false,
          createdAt: new Date(createdAt.getTime() + HOUR), updatedAt: new Date(createdAt.getTime() + HOUR),
        };
        globalCategoryByKey.set(globalKey, doc);
        ds.categories.push(doc);
      }
      categoryByKey[c.key] = doc;
    }

    const products = b.products.map((p, i) => {
      const status = p.st || 'ACTIVE';
      const made = new Date(createdAt.getTime() + (2 + i) * DAY * (b.ageDays > 30 ? 1 : 0.1));
      // Which branches carry it: a branch lists category keys (a parent covers its children).
      const parentKey = (b.categories.find((c) => c.key === p.c) || {}).parent;
      const carriers = branchDocs.filter(({ def }) => !def.only || def.only.includes(p.c) || (parentKey && def.only.includes(parentKey)));
      const branchIds = carriers.length === branchDocs.length ? [] : carriers.map(({ doc: br }) => br._id);
      // The shared catalogue item: created once, then reused by every store that sells it.
      let item = catalogBySlug.get(slugify(p.n));
      if (!item) {
        item = {
          _id: new ObjectId(), name: p.n, slug: slugify(p.n), categoryId: categoryByKey[p.c]._id, description: p.d,
          images: [photo(p.kw, 1), photo(p.kw, 2), photo(p.kw, 3)], scope: 'GLOBAL', status: 'ACTIVE', createdBy: admin._id,
          ...(p.m && { manufacturer: p.m }), ...(p.size && { size: p.size }), ...(p.barcode && { barcode: p.barcode }),
          createdAt: made, updatedAt: made,
        };
        catalogBySlug.set(item.slug, item);
        ds.catalogProducts.push(item);
      }
      const doc = {
        _id: new ObjectId(), brandId, catalogProductId: item._id, categoryId: item.categoryId, name: item.name, slug: item.slug,
        description: item.description, images: item.images, price: p.p,
        ...(p.cmp && { compareAtPrice: p.cmp }), sku: `${b.skuPrefix}-${pad(i + 1, 3)}`,
        isActive: status === 'ACTIVE' || status === 'DRAFT', status, attributes: p.a, branchIds, createdAt: made, updatedAt: made,
      };
      ds.products.push(doc);
      ds.inventories.push({
        _id: new ObjectId(), brandId, productId: doc._id, quantity: p.s, reservedQuantity: 0,
        lowStockThreshold: p.low ?? 5, trackInventory: p.track !== false, createdAt: made, updatedAt: made,
      });
      return { ...doc, stock: p.s, low: p.low ?? 5, track: p.track !== false };
    });

    // Staff accounts and their permission trail.
    const staff = b.staff.map((s, i) => {
      const joined = new Date(createdAt.getTime() + (3 + i) * DAY);
      const user = userDoc({
        name: s.name, email: s.email, phone: s.phone, role: 'BRAND_EMPLOYEE', passwordHash: hashes.demo,
        brandId, createdAt: joined, isActive: s.isActive !== false, restrictedUntil,
      });
      ds.users.push(user);

      const final = [...s.permissions];
      const history = i % 2 === 0 || final.length < 3
        ? [{ by: owner._id, at: joined, added: final, removed: [] }]
        : [
            { by: owner._id, at: joined, added: [...final, 'customers.view'], removed: [] },
            { by: owner._id, at: new Date(joined.getTime() + 9 * DAY), added: [], removed: ['customers.view'] },
          ];
      const active = s.isActive !== false;
      const employee = {
        _id: new ObjectId(), userId: user._id, brandId, role: 'BRAND_EMPLOYEE', permissions: final, permissionHistory: history,
        jobTitle: s.jobTitle, isActive: active, createdAt: joined, updatedAt: joined,
        ...(!active && {
          removedAt: new Date(joined.getTime() + 30 * DAY),
          removedBy: owner._id,
          removalReason: 'Left the company',
        }),
      };
      ds.employees.push(employee);
      return { user, employee, joined, changed: history.length > 1 };
    });

    // Riders: plain brand accounts that only the partner app can sign in to.
    const riders = (b.riders || []).map((r, i) => {
      const user = userDoc({
        name: r.name, email: r.email, phone: r.phone, role: 'RIDER', passwordHash: hashes.demo,
        brandId, createdAt: new Date(createdAt.getTime() + (5 + i) * DAY), restrictedUntil,
      });
      ds.users.push(user);
      return user;
    });

    // Pickers: a brand account with no team permissions, listed with the staff
    // in the brand's Team page so the owner can see and switch it off.
    const pickers = (PICKERS[b.key] ? [PICKERS[b.key]] : []).map((p, i) => {
      const joined = new Date(createdAt.getTime() + (5 + i) * DAY);
      const user = userDoc({
        name: p.name, email: p.email, phone: p.phone, role: 'PICKER', passwordHash: hashes.demo,
        brandId, createdAt: joined, restrictedUntil,
      });
      ds.users.push(user);
      ds.employees.push({
        _id: new ObjectId(), userId: user._id, brandId, role: 'PICKER', permissions: [],
        permissionHistory: [{ by: owner._id, at: joined, added: [], removed: [] }],
        jobTitle: 'Picker', isActive: true, createdAt: joined, updatedAt: joined,
      });
      return user;
    });

    brands.push({ def: b, doc: brandDoc, owner, store: storeDoc, categoryByKey, products, staff, riders, pickers, terminatedAt });
  }
  const brandByKey = Object.fromEntries(brands.map((b) => [b.def.key, b]));

  // Who handles what inside a brand: an employee with the right permission, otherwise the owner.
  const handler = (brand, permission) => {
    const match = brand.staff.find((s) => s.employee.isActive && s.employee.permissions.includes(permission));
    return match ? match.user : brand.owner;
  };

  // ── catalogue-only items: in the shared catalogue, listed by no store yet ──
  // These are the products the shipped sample CSV (sample-products-import.csv)
  // lists for the first store, so the import demo works on a fresh database.
  const sampleCatalog = require('./sample-catalog.json');
  for (const row of sampleCatalog) {
    const categoryDoc = ds.categories.find((c) => c.name === row.category && !ds.categories.some((x) => String(x.parentId) === String(c._id)));
    if (!categoryDoc) throw new Error(`sample-catalog.json: unknown category "${row.category}"`);
    if (catalogBySlug.has(slugify(row.name))) continue;
    const made = new Date(now.getTime() - 20 * DAY);
    const item = {
      _id: new ObjectId(), name: row.name, slug: slugify(row.name), categoryId: categoryDoc._id, description: row.description,
      images: row.images, scope: 'GLOBAL', status: 'ACTIVE', createdBy: admin._id, createdAt: made, updatedAt: made,
    };
    catalogBySlug.set(item.slug, item);
    ds.catalogProducts.push(item);
  }

  // ── catalogue requests and a merged duplicate, so the admin queue is not empty ──
  const brandDocOf = (key) => ds.brands.find((x) => x.name === BRANDS.find((b) => b.key === key).name);
  const ownerOf = (brand) => ds.users.find((u) => u.role === 'BRAND_ADMIN' && String(u.brandId) === String(brand._id));
  const leaf = (name) => ds.categories.find((c) => c.name === name);
  const request = (brandKey, name, categoryName, extra) => {
    const brand = brandDocOf(brandKey);
    const made = ago(6 * DAY);
    const item = {
      _id: new ObjectId(), name, slug: slugify(name), categoryId: leaf(categoryName)._id, brandId: brand._id, createdBy: ownerOf(brand)._id,
      images: [photo(slugify(name), 1)], createdAt: made, updatedAt: made, ...extra,
    };
    catalogBySlug.set(item.slug, item);
    ds.catalogProducts.push(item);
    return item;
  };
  // A store's own item, usable only by that store.
  request('sukoon', 'Monogrammed Cushion Cover, made to order', 'Cushions & Rugs', {
    description: 'Cushion cover embroidered with the buyer\'s initials. Made to order in about a week.', scope: 'PRIVATE', status: 'ACTIVE',
  });
  // Waiting for the platform admin.
  request('zaitoon', 'Hand-Stitched Leather Slippers, Kids', 'Chappals & Sandals', {
    description: 'Soft leather slippers for children, hand-stitched.', scope: 'GLOBAL', status: 'PENDING',
  });
  // Turned down, with the reason the store sees.
  request('naqsh', 'Silver-Plated Anklet Pair', 'Earrings', {
    description: 'Plain silver-plated anklets.', scope: 'GLOBAL', status: 'REJECTED',
    reviewNote: 'Not a fit for the Earrings category. Please request it again under a jewellery category that fits.',
    reviewedBy: admin._id, reviewedAt: ago(5 * DAY),
  });
  // A duplicate that an admin merged into the real item.
  const shared = catalogBySlug.get(slugify('Plain White Cotton Suit Length, 2.5 m'));
  const duplicateMade = ago(30 * DAY);
  ds.catalogProducts.push({
    _id: new ObjectId(), name: 'Plain White Cotton Suit Length 2.5m', slug: slugify('Plain White Cotton Suit Length 2.5m'),
    categoryId: shared.categoryId, scope: 'GLOBAL', status: 'ARCHIVED', mergedIntoId: shared._id, createdBy: admin._id,
    createdAt: duplicateMade, updatedAt: ago(25 * DAY),
  });

  // ── open carts ──
  for (const [customerIndex, lines] of CARTS) {
    const customer = customers[customerIndex];
    ds.carts.push({
      _id: new ObjectId(), userId: customer.doc._id,
      items: lines.map(([brandKey, productName, quantity]) => {
        const brand = brandByKey[brandKey];
        const product = brand.products.find((p) => p.name === productName);
        if (!product) throw new Error(`Cart refers to an unknown product: ${productName}`);
        return { _id: new ObjectId(), productId: product._id, brandId: brand.doc._id, quantity };
      }),
      createdAt: ago(intBetween(1, 6) * DAY), updatedAt: ago(intBetween(1, 20) * HOUR),
    });
  }

  // ── orders, with their payments and deliveries ──
  const PLAN = {
    loom: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'CANCELLED', 'SHIPPED'],
    rangrez: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'PROCESSING', 'REJECTED'],
    mehr: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'OUT_FOR_DELIVERY', 'SHIPPED', 'CANCELLED'],
    sukoon: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'CONFIRMED', 'PENDING', 'READY_FOR_SHIPMENT', 'OUT_FOR_DELIVERY'],
    zaitoon: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'PROCESSING', 'SHIPPED', 'REJECTED'],
    naqsh: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY'],
    gadgets: ['DELIVERED', 'DELIVERED'],
    quick: ['DELIVERED', 'DELIVERED', 'REJECTED', 'REJECTED'],
  };
  const CHAIN = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const LAST_EVENT_HOURS = {
    PENDING: [0.5, 30], CONFIRMED: [3, 50], PROCESSING: [5, 70], READY_FOR_SHIPMENT: [8, 80], SHIPPED: [20, 90],
    OUT_FOR_DELIVERY: [1, 8], DELIVERED: [24 * 12, 24 * 58], CANCELLED: [24 * 2, 24 * 25], REJECTED: [24 * 2, 24 * 25],
  };
  const COURIERS = { loom: 'TCS', rangrez: 'LEO', mehr: 'TCS', sukoon: 'TRAX', zaitoon: 'LEO', naqsh: 'TCS', gadgets: 'TRAX', quick: 'LEO' };
  const AGENTS = ['Shoaib (rider)', 'Naveed Akram (TCS)', 'Rizwan (Leopards)', 'Kamran Ali (Trax)', 'Adnan (company rider)', 'Mubashir (rider)'];
  const GIFT_NOTES = ['Gift: please remove the price slip.', 'Needed before the weekend if possible.', 'Please pack carefully, it is a gift.'];

  const orders = [];
  const receiptJobs = [];
  for (const [brandKey, statuses] of Object.entries(PLAN)) {
    const brand = brandByKey[brandKey];
    const sellable = brand.products.filter((p) => (brandKey === 'quick' ? true : p.status === 'ACTIVE'));

    statuses.forEach((status, indexInBrand) => {
      const customer = pick(shoppers);
      const orderHandler = handler(brand, 'orders.manage');
      const deliveryHandler = handler(brand, 'delivery.manage');

      // items
      const chosen = [];
      const wanted = Math.min(sellable.length, intBetween(1, 3));
      while (chosen.length < wanted) {
        const p = pick(sellable);
        if (!chosen.includes(p)) chosen.push(p);
      }
      const items = chosen.map((p) => {
        const quantity = brandKey === 'rangrez' && /per metre/.test(p.name) ? intBetween(3, 10) : intBetween(1, 3);
        return { _id: new ObjectId(), productId: p._id, productName: p.name, sku: p.sku, quantity, unitPrice: p.price, totalPrice: p.price * quantity, image: p.images[0] };
      });
      const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
      const freeAbove = brand.def.settings.freeDeliveryAbove;
      const deliveryFee = freeAbove && subtotal >= freeAbove ? 0 : 250;
      const discount = status === 'DELIVERED' && indexInBrand % 4 === 1 ? Math.round((subtotal * 0.1) / 10) * 10 : 0;
      const tax = brand.def.settings.taxRatePercent ? Math.round((subtotal * brand.def.settings.taxRatePercent) / 100) : 0;
      const total = subtotal + deliveryFee - discount + tax;
      const notes = discount > 0 ? 'Customer used the 10% Eid offer.' : indexInBrand % 5 === 3 ? pick(GIFT_NOTES) : undefined;

      // timeline: walk backwards from the last event so nothing lies in the future
      const path = status === 'CANCELLED' || status === 'REJECTED' ? ['PENDING', status] : CHAIN.slice(0, CHAIN.indexOf(status) + 1);
      let lastEvent;
      let events;
      if (brandKey === 'quick' && status === 'REJECTED') {
        const rejectedAt = new Date(brand.terminatedAt.getTime() + intBetween(5, 30) * 60 * 1000);
        events = [{ status: 'PENDING', at: new Date(brand.terminatedAt.getTime() - intBetween(20, 60) * HOUR) }, { status: 'REJECTED', at: rejectedAt }];
      } else {
        // One old delivered order (loom's second) is from last quarter, so its checked
        // payment proof can already be past the 90-day photo retention (docs/21 §I.4).
        const [lo, hi] = brandKey === 'loom' && indexInBrand === 1 && status === 'DELIVERED'
          ? [24 * 120, 24 * 128]
          : brandKey === 'gadgets' || brandKey === 'quick' ? [24 * 35, 24 * 65] : LAST_EVENT_HOURS[status];
        lastEvent = ago(between(lo, hi) * HOUR);
        events = [];
        let cursor = lastEvent;
        for (let i = path.length - 1; i >= 0; i -= 1) {
          events.unshift({ status: path[i], at: cursor });
          cursor = new Date(cursor.getTime() - between(1, i >= path.length - 2 ? 40 : 18) * HOUR);
        }
      }
      const packedEvent = events.find((e) => e.status === 'READY_FOR_SHIPMENT');
      const byFor = (s) => {
        if (s === 'PENDING' || (s === 'CANCELLED')) return customer.doc._id;
        if (brandKey === 'quick' && s === 'REJECTED') return admin._id;
        if (s === 'SHIPPED' || s === 'OUT_FOR_DELIVERY' || s === 'DELIVERED') return deliveryHandler._id;
        return orderHandler._id;
      };
      const statusHistory = events.map((e) => ({ status: e.status, by: byFor(e.status), at: e.at }));
      const createdAt = events[0].at;
      const finishedAt = events[events.length - 1].at;

      const flags = {
        fullRefund: brandKey === 'loom' && status === 'DELIVERED' && indexInBrand === 0,
        partRefund: brandKey === 'mehr' && status === 'DELIVERED' && indexInBrand === 1,
        failedDelivery: brandKey === 'mehr' && status === 'OUT_FOR_DELIVERY',
        inTransit: brandKey === 'mehr' && status === 'SHIPPED',
      };

      // Delivered to the customer's pin when one of the store's shops serves that block;
      // otherwise to a spot in the store's own block (an office or a friend's place).
      const brandShops = ds.branches.filter((br) => String(br.brandId) === String(brand.doc._id) && br.isActive);
      const servesHome = brandShops.some((br) => br.blockIds.some((id) => customer.blockIds.some((b) => String(b) === String(id))));
      const delivery = servesHome
        ? { location: customer.pin, blockIds: customer.blockIds, addressId: customer.addressId }
        : (({ location, blockIds }) => ({ location, blockIds }))(brandShops[0] || ds.branches.find((br) => String(br.brandId) === String(brand.doc._id)));

      const order = {
        _id: new ObjectId(), orderNumber: '', customerId: customer.doc._id, brandId: brand.doc._id, items,
        deliveryLocation: delivery.location, deliveryBlockIds: delivery.blockIds, ...(delivery.addressId && { addressId: delivery.addressId }),
        shippingAddress: {
          name: customer.name, phone: customer.phone, address: customer.address, city: customer.city, state: customer.state,
          country: 'Pakistan', postalCode: customer.postalCode, ...(customer.note && { additionalInstructions: customer.note }),
        },
        subtotal, deliveryFee, discount, tax, total, paymentMethod: 'COD',
        paymentStatus: status === 'CANCELLED' || status === 'REJECTED' ? 'CANCELLED' : status === 'DELIVERED' ? 'PAID' : 'PENDING',
        currency: 'PKR', orderStatus: status, statusHistory, ...(notes && { notes }),
        ...(packedEvent && { packedAt: packedEvent.at }), createdAt, updatedAt: finishedAt,
      };
      if (flags.fullRefund) order.paymentStatus = 'REFUNDED';
      if (flags.partRefund) order.paymentStatus = 'PARTIALLY_REFUNDED';
      ds.orders.push(order);

      // payment
      const payment = {
        _id: new ObjectId(), orderId: order._id, customerId: customer.doc._id, amount: total, method: order.paymentMethod, status: order.paymentStatus,
        currency: 'PKR', createdAt, updatedAt: finishedAt, refundedAmount: 0, refunds: [],
      };
      let collector = null;
      if (status === 'DELIVERED') {
        // Whoever completes the delivery takes the cash: the rider when the brand has riders (the same one
        // the delivery below is given to), otherwise the team member. Older cash has been handed over.
        collector = brand.riders.length ? brand.riders[ds.deliveries.length % brand.riders.length] : deliveryHandler;
        const handedOver = finishedAt < ago(20 * DAY);
        Object.assign(payment, {
          paidAt: finishedAt, confirmedBy: collector._id, provider: 'Cash on Delivery', transactionReference: `RCPT-${pad(ds.orders.length, 6)}`,
          brandId: brand.doc._id, collectedBy: collector._id, collectedAt: finishedAt, collection: { method: 'CASH' },
          ...(handedOver && { settledAt: new Date(finishedAt.getTime() + DAY), settledBy: brand.owner._id }),
        });
        receiptJobs.push({ order, payment, brand, collector });
      }
      if (flags.fullRefund || flags.partRefund) {
        const amount = flags.fullRefund ? total : Math.round(items[0].totalPrice / 2 / 10) * 10;
        const at = new Date(finishedAt.getTime() + 3 * DAY);
        payment.refundedAmount = amount;
        payment.refunds = [{
          amount, by: brand.owner._id, at,
          reason: flags.fullRefund ? 'The suit arrived with a printing fault. Full refund agreed with the customer.' : 'One item was returned because the size did not fit. Partial refund issued.',
        }];
        payment.updatedAt = at;
        order.updatedAt = at;
      }
      ds.payments.push(payment);

      // delivery
      const readyEvent = events.find((e) => e.status === 'READY_FOR_SHIPMENT');
      if (readyEvent) {
        const deliveryStatus = status === 'READY_FOR_SHIPMENT' ? 'READY_FOR_PICKUP'
          : status === 'SHIPPED' ? (flags.inTransit ? 'IN_TRANSIT' : 'PICKED_UP')
          : status === 'OUT_FOR_DELIVERY' ? (flags.failedDelivery ? 'FAILED' : 'OUT_FOR_DELIVERY') : 'DELIVERED';
        // A brand with riders hands its deliveries to them; the others use a courier or a named agent.
        const rider = deliveryStatus !== 'READY_FOR_PICKUP' && brand.riders.length ? brand.riders[ds.deliveries.length % brand.riders.length] : null;
        ds.deliveries.push({
          _id: new ObjectId(), orderId: order._id, brandId: brand.doc._id, customerId: customer.doc._id, status: deliveryStatus,
          address: { ...order.shippingAddress }, deliveryFee,
          // The customer's proof-of-delivery code, made with the delivery; a failed attempt cost one wrong try.
          deliveryCode: pad(Math.floor(random() * 1e6), 6), codeAttempts: deliveryStatus === 'FAILED' ? 1 : 0,
          ...(deliveryStatus !== 'READY_FOR_PICKUP' && {
            trackingReference: `${COURIERS[brandKey]}-${pad(Math.floor(random() * 1e10), 10)}`,
            assignedAgent: rider ? rider.name : pick(AGENTS),
          }),
          ...(rider && { riderId: rider._id, assignedAt: new Date(readyEvent.at.getTime() + 30 * 60 * 1000) }),
          ...(deliveryStatus === 'FAILED' && { failureReason: 'The customer\'s phone was switched off and nobody was at the address. The rider will try again tomorrow.' }),
          createdAt: readyEvent.at, updatedAt: finishedAt,
        });
      }
      orders.push({ order, payment, brand, customer, events, flags, orderHandler, deliveryHandler });
    });
  }

  // Order numbers run in order of creation, with one counter per year (as the app does).
  const perYear = {};
  [...orders].sort((a, b) => a.order.createdAt - b.order.createdAt).forEach(({ order }) => {
    const year = order.createdAt.getUTCFullYear();
    perYear[year] = (perYear[year] || 0) + 1;
    order.orderNumber = `CC-${year}-${pad(perYear[year], 6)}`;
  });
  for (const [year, seq] of Object.entries(perYear)) ds.counters.push({ _id: `order-${year}`, seq });

  // ── door returns (docs/22 §F): what the rider brought back ──
  // Three stories, so every screen has something to show: a damaged suit refused at
  // the door and still travelling back with the rider; half an order refused and
  // already taken in (the sellable piece went back on the shelf); and a whole cash
  // order refused for damage, which ends RETURNED with nothing to collect.
  const deliveryOf = (order) => ds.deliveries.find((d) => String(d.orderId) === String(order._id));
  const completedAtOf = ({ events }) => events[events.length - 1].at;
  // The line a partial refusal can take a unit from: one order line with several
  // units, or one of several lines (so the rest of the order is still accepted).
  const partialLine = (order) => order.items.find((i) => i.quantity > 1)
    || (order.items.length > 1 ? order.items.find((i) => i.quantity === 1) : null);

  const usedReturnOrders = new Set();
  const usedReturnBrands = new Set();
  const returnOrder = ({ paymentMethod, rider, netZero, partial }) => {
    const pool = orders.filter((entry) => {
      const { order, payment, flags } = entry;
      const delivery = deliveryOf(order);
      if (order.orderStatus !== 'DELIVERED' || flags.fullRefund || flags.partRefund) return false;
      if (usedReturnOrders.has(String(order._id))) return false;
      if (payment.status !== 'PAID' || payment.refunds.length) return false;
      if (order.paymentMethod !== paymentMethod) return false;
      if (!delivery || delivery.status !== 'DELIVERED') return false;
      if (rider && !delivery.riderId) return false;
      if (netZero && (order.tax !== 0 || order.discount !== 0 || order.deliveryFee === 0)) return false;
      if (partial && !partialLine(order)) return false;
      return true;
    });
    return pool.find((entry) => !usedReturnBrands.has(String(entry.order.brandId))) || pool[0] || null;
  };

  const returnLine = (item, quantity, reason, extra = {}) => ({
    orderItemId: item._id, productId: item.productId, productName: item.productName,
    quantity, unitPrice: item.unitPrice, reason, ...extra,
  });

  const addDoorReturn = ({ entry, status, lines, receivedAt, receivedBy }) => {
    const { order, payment, events, deliveryHandler } = entry;
    const delivery = deliveryOf(order);
    const completedAt = completedAtOf(entry);
    const returnedSubtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const everythingRejected = returnedSubtotal >= order.subtotal;
    const feeRefunded = everythingRejected && lines.some((line) => STORE_FAULT_REASONS.includes(line.reason));
    const netTotal = Math.max(0, order.total - returnedSubtotal - (feeRefunded ? order.deliveryFee : 0));
    order.fulfilment = everythingRejected ? 'NONE' : 'PARTIAL';
    order.returnedAmount = returnedSubtotal;
    order.feeRefunded = feeRefunded;
    order.netTotal = netTotal;

    const refundAmount = 0;
    if (netTotal > 0) {
      // The rider collected for the accepted units only.
      payment.amount = netTotal;
      payment.updatedAt = completedAt;
    } else {
      // Nothing was accepted, so nothing was collected and the payment never happened.
      payment.status = 'CANCELLED';
      ['paidAt', 'confirmedBy', 'brandId', 'collectedBy', 'collectedAt', 'settledAt', 'settledBy', 'transactionReference', 'provider', 'collection']
        .forEach((field) => delete payment[field]);
      payment.updatedAt = completedAt;
      order.paymentStatus = 'CANCELLED';
      const job = receiptJobs.findIndex((r) => r.payment === payment);
      if (job !== -1) receiptJobs.splice(job, 1);
    }

    if (everythingRejected) {
      // Everything went back: the order and its delivery end as RETURNED.
      order.orderStatus = 'RETURNED';
      const last = events[events.length - 1];
      last.status = 'RETURNED';
      order.statusHistory[order.statusHistory.length - 1] = {
        status: 'RETURNED', by: delivery.riderId || deliveryHandler._id, at: last.at,
      };
    }

    const ret = {
      _id: new ObjectId(), orderId: order._id, deliveryId: delivery._id, brandId: order.brandId, customerId: order.customerId,
      ...(delivery.riderId && { riderId: delivery.riderId }),
      source: 'DOOR', status, lines, returnedSubtotal, feeRefunded, refundAmount, currency: order.currency || 'PKR',
      ...(status === 'RECEIVED' && { receivedAt, receivedBy: receivedBy._id }),
      createdAt: completedAt, updatedAt: receivedAt || completedAt,
    };
    ds.returns.push(ret);
    delivery.returnId = ret._id;
    delivery.status = everythingRejected ? 'RETURNED' : 'DELIVERED';
    usedReturnOrders.add(String(order._id));
    usedReturnBrands.add(String(order.brandId));

    if (status === 'RECEIVED') {
      for (const line of lines) {
        if (!line.restock) continue;
        const inventory = ds.inventories.find((inv) => String(inv.productId) === String(line.productId));
        if (inventory && inventory.trackInventory) {
          inventory.quantity += line.quantity;
          inventory.updatedAt = receivedAt;
        }
        ds.inventoryMovements.push({
          _id: new ObjectId(), productId: line.productId, brandId: order.brandId, orderId: order._id,
          reason: 'RETURN_RESTOCKED', quantityChange: line.quantity, reservedChange: 0, by: receivedBy._id, createdAt: receivedAt,
        });
      }
    }
    return ret;
  };

  const inTransit = returnOrder({ paymentMethod: 'COD', rider: true, partial: true });
  if (inTransit) {
    const item = partialLine(inTransit.order);
    const delivery = deliveryOf(inTransit.order);
    addDoorReturn({
      entry: inTransit, status: 'IN_TRANSIT',
      lines: [returnLine(item, Math.min(1, item.quantity), 'DAMAGED', {
        photo: {
          publicId: `citycart/brands/${inTransit.order.brandId}/deliveries/${delivery._id}/returns/refused-${item._id}.jpg`,
          fingerprint: `etag-refused-${item._id}`,
        },
      })],
    });
  }

  const received = returnOrder({ paymentMethod: 'COD', partial: true });
  if (received) {
    const item = partialLine(received.order);
    // The store takes the goods in the next day (never in the future).
    const receivedAt = new Date(Math.min(now.getTime() - 2 * HOUR, completedAtOf(received).getTime() + 20 * HOUR));
    addDoorReturn({
      entry: received, status: 'RECEIVED', receivedAt, receivedBy: received.brand.owner,
      lines: [returnLine(item, Math.min(1, item.quantity), 'NOT_WANTED', { restock: true, restockedAt: receivedAt })],
    });
  }

  const fullyRejected = returnOrder({ paymentMethod: 'COD', netZero: true });
  if (fullyRejected) {
    addDoorReturn({
      entry: fullyRejected, status: 'IN_TRANSIT',
      lines: fullyRejected.order.items.map((item, index) => returnLine(item, item.quantity, index === 0 ? 'DAMAGED' : 'MISSING')),
    });
  }

  // Every other delivered order arrived complete.
  for (const { order } of orders) {
    if (order.orderStatus !== 'DELIVERED' || order.fulfilment) continue;
    order.fulfilment = 'FULL';
    order.returnedAmount = 0;
    order.feeRefunded = false;
    order.netTotal = order.total;
  }

  // ── picking: accepted orders wait in the queue; one picker has started an order (docs/22 §E) ──
  // CONFIRMED orders are already waiting, unclaimed. A PROCESSING order with a
  // picker shows what a half-picked order looks like: only the last line to go.
  const loomPicking = orders.find(({ order, brand }) => brand.def.key === 'loom' && order.orderStatus === 'PROCESSING');
  if (loomPicking && loomPicking.brand.pickers.length) {
    const picker = loomPicking.brand.pickers[0];
    const startEvent = loomPicking.events.find((e) => e.status === 'PROCESSING');
    loomPicking.order.pickerId = picker._id;
    loomPicking.order.pickStartedAt = new Date(Math.min(now.getTime(), startEvent.at.getTime() + 5 * 60 * 1000));
    loomPicking.order.items.forEach((item, i) => {
      if (i < loomPicking.order.items.length - 1) {
        item.pickStatus = 'PICKED';
        item.pickedQty = item.quantity;
      }
    });
  }

  // ── a few COD orders were paid at the door by transfer, wallet or card (docs/21 §I) ──
  // The money was received (the orders are paid), but nobody holds cash: each carries a
  // private photo and a reference, and the brand has checked some of them.
  const doorEntries = orders.filter(({ order, payment }) =>
    order.paymentMethod === 'COD' && payment.status === 'PAID' && payment.paidAt && !payment.refunds.length && payment.collectedBy
  );
  // The order from last quarter: its photo was deleted after the 90-day retention.
  const oldProof = doorEntries.find((e) => now - e.payment.paidAt > 100 * DAY);
  const doorPlans = [
    { entry: oldProof, method: 'BANK_TRANSFER', reference: 'HBL-778812', verification: 'VERIFIED', note: 'Matched the August bank statement.', deleted: true },
    { method: 'CARD_MACHINE', reference: 'APPR-552310', verification: 'VERIFIED', note: 'Card settlement matched the approval code.' },
    { method: 'WALLET', wallet: 'EASYPAISA', reference: 'EP-220145', verification: 'VERIFIED', note: 'Seen in the wallet statement.' },
  ];
  // The other three come from three different brands, so the queue is not all one shop's.
  const usedBrands = new Set([String(oldProof?.order.brandId)]);
  const remaining = doorEntries.filter((e) => e !== oldProof && !usedBrands.has(String(e.order.brandId)));
  for (const plan of doorPlans.filter((p) => !p.entry)) {
    plan.entry = remaining.find((e) => !usedBrands.has(String(e.order.brandId)));
    if (plan.entry) usedBrands.add(String(plan.entry.order.brandId));
  }

  for (const plan of doorPlans) {
    if (!plan.entry) continue;
    const { order, payment, brand } = plan.entry;
    const delivery = ds.deliveries.find((d) => String(d.orderId) === String(order._id));
    if (!delivery) continue;
    const folder = `citycart/brands/${brand.doc._id}/deliveries/${delivery._id}/payment-proofs`;
    // Verification is what completes the delivery, so the check and the money
    // arrive together; the rider sent the proof a couple of hours earlier.
    const submittedAt = new Date(payment.paidAt.getTime() - 2 * HOUR);
    const verifiedAt = plan.verification === 'SUBMITTED' ? undefined : payment.paidAt;

    payment.method = PAYMENT_METHOD_FOR_COLLECTION[plan.method];
    // Non-cash money is never in a rider's hand: no collector, nothing to settle.
    delete payment.collectedBy;
    delete payment.collectedAt;
    delete payment.settledAt;
    delete payment.settledBy;
    delete payment.transactionReference;
    delete payment.provider;
    payment.collection = {
      method: plan.method,
      ...(plan.wallet && { wallet: plan.wallet }),
      reference: plan.reference,
      proof: { publicId: `${folder}/${plan.reference.toLowerCase()}.jpg`, fingerprint: `etag-${plan.reference.toLowerCase()}` },
      submittedAt,
      verification: plan.verification,
      ...(verifiedAt && {
        verifiedBy: brand.owner._id,
        verifiedAt,
        ...(plan.note && { note: plan.note }),
      }),
      duplicateReference: Boolean(plan.duplicateReference),
      duplicateProof: Boolean(plan.duplicateProof),
    };
    if (plan.deleted) {
      delete payment.collection.proof;
      payment.collection.proofDeletedAt = new Date(verifiedAt.getTime() + 90 * DAY);
    }

    // The receipt shows who took the cash; a non-cash payment has nobody to name.
    const job = receiptJobs.find((r) => r.payment === payment);
    if (job) job.collector = null;
  }

  // ── non-cash payments still with the brand (docs/10 §31) ──
  // A non-cash payment completes its delivery only when the records keeper verifies
  // it. Two riders are at the door: one is waiting for the check; one had the proof
  // refused and is collecting again. Neither delivery is complete yet.
  const awaitingCheck = orders.filter(({ order, payment, brand }) => {
    const delivery = deliveryOf(order);
    return order.orderStatus === 'OUT_FOR_DELIVERY' && order.paymentMethod === 'COD'
      && payment.status === 'PENDING' && !payment.collection && !payment.refunds.length
      && delivery && delivery.status === 'OUT_FOR_DELIVERY'
      && (delivery.riderId || brand.riders.length > 0);
  });
  const waitingEntry = awaitingCheck[0];
  const refusedEntry = (waitingEntry && awaitingCheck.find((e) => String(e.order.brandId) !== String(waitingEntry.order.brandId)))
    || awaitingCheck[1];

  const stageDoorPayment = (entry, { method, reference, verification, reject }) => {
    const { order, payment, brand } = entry;
    const delivery = deliveryOf(order);
    // A delivery without a rider gets one of the brand's, so this rider's screen
    // really shows the waiting/refused card.
    if (!delivery.riderId && brand.riders.length) {
      const rider = brand.riders[0];
      delivery.riderId = rider._id;
      delivery.assignedAgent = rider.name;
      delivery.assignedAt = new Date(delivery.createdAt.getTime() + 30 * (HOUR / 60));
    }
    const folder = `citycart/brands/${brand.doc._id}/deliveries/${delivery._id}`;
    const at = new Date(Math.min(now.getTime() - 20 * (HOUR / 60), delivery.updatedAt.getTime() + 20 * (HOUR / 60)));
    const first = order.items[0];
    const rejectedQty = reject ? Math.max(1, Math.floor(first.quantity / 2)) : 0;
    const netTotal = Math.max(0, order.total - rejectedQty * first.unitPrice);

    payment.method = PAYMENT_METHOD_FOR_COLLECTION[method];
    payment.collection = {
      method,
      ...(method === 'WALLET' && { wallet: 'JAZZCASH' }),
      reference,
      proof: { publicId: `${folder}/payment-proofs/${reference.toLowerCase()}.jpg`, fingerprint: `etag-${reference.toLowerCase()}` },
      submittedAt: at,
      verification,
      duplicateReference: false,
      duplicateProof: false,
      ...(reject && {
        verifiedBy: brand.owner._id,
        verifiedAt: new Date(at.getTime() + 10 * (HOUR / 60)),
        note: 'No card settlement matches this approval code.',
      }),
    };
    payment.updatedAt = at;

    delivery.pendingCompletion = {
      paymentId: payment._id,
      lines: order.items.map((item) => (item === first && rejectedQty > 0
        ? {
            itemId: item._id, acceptedQty: item.quantity - rejectedQty, rejectedQty,
            reason: 'DAMAGED',
            photo: { publicId: `${folder}/returns/refused.jpg`, fingerprint: 'etag-refused' },
          }
        : { itemId: item._id, acceptedQty: item.quantity, rejectedQty: 0 })),
      netTotal,
      submittedBy: delivery.riderId,
      submittedAt: at,
      ...(reject && { rejectedAt: new Date(at.getTime() + 10 * (HOUR / 60)) }),
    };
    delivery.updatedAt = at;
    return at;
  };

  if (waitingEntry) {
    const at = stageDoorPayment(waitingEntry, { method: 'BANK_TRANSFER', reference: 'FT-771204', verification: 'SUBMITTED' });
    const { brand } = waitingEntry;
    const folder = `citycart/brands/${brand.doc._id}/deliveries/${deliveryOf(waitingEntry.order)._id}`;
    // Two earlier attempts: one refused by the brand, one too old to keep a photo.
    waitingEntry.payment.collectionHistory = [
      {
        method: 'CARD_MACHINE', reference: 'APPR-330011',
        submittedAt: new Date(at.getTime() - 200 * DAY),
        verification: 'REJECTED', verifiedBy: brand.owner._id, verifiedAt: new Date(at.getTime() - 200 * DAY + HOUR),
        duplicateReference: false, duplicateProof: false,
        proofDeletedAt: new Date(at.getTime() - 200 * DAY + 90 * DAY),
      },
      {
        method: 'WALLET', wallet: 'JAZZCASH', reference: 'JC-771204',
        proof: { publicId: `${folder}/payment-proofs/jc-771204.jpg`, fingerprint: 'etag-jc-771204' },
        submittedAt: new Date(at.getTime() - 2 * HOUR),
        verification: 'REJECTED', verifiedBy: brand.owner._id, verifiedAt: new Date(at.getTime() - HOUR),
        note: 'The screenshot did not show the transaction id.',
        duplicateReference: true, duplicateProof: true,
      },
    ];
  }
  if (refusedEntry) {
    stageDoorPayment(refusedEntry, { method: 'CARD_MACHINE', reference: 'APPR-880451', verification: 'REJECTED', reject: true });
  }

  // A receipt for every paid payment, numbered in the order the money came in (one counter per year).
  const receiptsPerYear = {};
  receiptJobs.sort((a, c) => a.payment.paidAt - c.payment.paidAt).forEach(({ order, payment, brand, collector }) => {
    const year = payment.paidAt.getUTCFullYear();
    receiptsPerYear[year] = (receiptsPerYear[year] || 0) + 1;
    ds.receipts.push({
      _id: new ObjectId(), receiptNumber: `RC-${year}-${pad(receiptsPerYear[year], 6)}`, paymentId: payment._id, orderId: order._id,
      orderNumber: order.orderNumber, brandId: order.brandId, brandName: brand.def.name, customerId: order.customerId,
      billedTo: order.shippingAddress.name, method: payment.method, amount: payment.amount, currency: payment.currency,
      ...(payment.collection && {
        collectionMethod: payment.collection.method,
        ...(payment.collection.wallet && { collectionWallet: payment.collection.wallet }),
        ...(payment.collection.reference && { collectionReference: payment.collection.reference }),
      }),
      items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice })),
      subtotal: order.subtotal, deliveryFee: order.deliveryFee, discount: order.discount, tax: order.tax,
      ...(payment.transactionReference && { transactionReference: payment.transactionReference }),
      ...(payment.provider && { provider: payment.provider }),
      ...(collector && { collectedBy: collector._id, collectedByName: collector.name }), issuedAt: payment.paidAt, createdAt: payment.paidAt,
    });
  });
  for (const [year, seq] of Object.entries(receiptsPerYear)) ds.counters.push({ _id: `receipt-${year}`, seq });

  // ── adjustments: a brand could not supply everything, so it proposed a change (docs/21 §H) ──
  const orderEntryById = new Map(orders.map((entry) => [String(entry.order._id), entry]));
  const inventoryFor = (productId) => ds.inventories.find((i) => String(i.productId) === String(productId));
  const totalsSnapshot = (order, subtotal) => ({
    subtotal, deliveryFee: order.deliveryFee, discount: order.discount, tax: order.tax,
    total: subtotal + order.deliveryFee - order.discount + order.tax,
  });

  const addAdjustment = ({ order, status, at, supplyAllBut, wantSubstitute, respondedAt, action, responseNote, restockRemoved, noteText, proposer, proposerRole }) => {
    const { brand } = orderEntryById.get(String(order._id));
    const item = order.items[0];
    const supplyQuantity = Math.max(0, item.quantity - supplyAllBut);
    const missing = item.quantity - supplyQuantity;

    let substitute = null;
    if (wantSubstitute && missing > 0) {
      const product = brand.products.find((p) => p.status === 'ACTIVE' && p.track !== false
        && String(p._id) !== String(item.productId) && (inventoryFor(p._id)?.quantity || 0) >= missing);
      if (product) {
        substitute = {
          productId: product._id, productName: product.name, sku: product.sku,
          unitPrice: product.price, image: product.images[0], quantity: missing,
        };
      }
    }

    const suppliedValue = item.unitPrice * supplyQuantity;
    const totalsBefore = totalsSnapshot(order, order.subtotal);
    const totalsAfter = totalsSnapshot(order, order.subtotal - item.totalPrice + suppliedValue + (substitute ? substitute.unitPrice * substitute.quantity : 0));
    const totalsAfterRemoval = totalsSnapshot(order, order.subtotal - item.totalPrice + suppliedValue);
    const proposedBy = proposer || handler(brand, 'orders.adjust');

    const adjustment = {
      _id: new ObjectId(), orderId: order._id, brandId: order.brandId, customerId: order.customerId, status,
      note: noteText,
      lines: [{
        orderItemId: item._id, productId: item.productId, productName: item.productName, sku: item.sku, image: item.image,
        orderedQuantity: item.quantity, unitPrice: item.unitPrice, supplyQuantity, substitute,
      }],
      stockReservations: substitute ? [{ productId: substitute.productId, quantity: substitute.quantity }] : [],
      restockRemoved: !!restockRemoved, totalsBefore, totalsAfter, totalsAfterRemoval, proposedBy: proposedBy._id,
      ...(proposerRole && { proposedByRole: proposerRole }),
      expiresAt: new Date(at.getTime() + 24 * HOUR), respondedAt: respondedAt || null,
      response: status === 'PROPOSED' ? null : { action, by: status === 'EXPIRED' ? undefined : order.customerId, at: respondedAt, note: responseNote },
      createdAt: at, updatedAt: respondedAt || at,
    };
    if (adjustment.response && !adjustment.response.by) delete adjustment.response.by;
    ds.orderAdjustments.push(adjustment);

    if (status === 'PROPOSED') order.activeAdjustmentId = adjustment._id;
    if (substitute) {
      if (status === 'PROPOSED') {
        const inventory = inventoryFor(substitute.productId);
        inventory.reservedQuantity += substitute.quantity;
        inventory.updatedAt = at;
      }
      const movement = (reason, quantityChange, reservedChange, when) => ds.inventoryMovements.push({
        _id: new ObjectId(), productId: substitute.productId, brandId: order.brandId, orderId: order._id,
        adjustmentId: adjustment._id, reason, quantityChange, reservedChange, by: proposedBy._id, createdAt: when,
      });
      movement('SUBSTITUTION_RESERVED', 0, substitute.quantity, at);
      if (status !== 'PROPOSED') movement('SUBSTITUTION_RELEASED', 0, -substitute.quantity, respondedAt);
    }
  };

  // An active proposal waiting for an answer, one the customer answered by cancelling, and one that ran out of time.
  const adjustable = (status, used) => orders.find(({ order, brand }) => order.orderStatus === status
    && !used.has(order._id)
    && brand.products.filter((p) => p.status === 'ACTIVE' && p.track !== false).length >= 2);
  const usedOrders = new Set();

  const activeEntry = adjustable('CONFIRMED', usedOrders);
  if (activeEntry) {
    usedOrders.add(activeEntry.order._id);
    addAdjustment({
      order: activeEntry.order, status: 'PROPOSED', at: new Date(now.getTime() - 5 * HOUR), supplyAllBut: 1, wantSubstitute: true,
      noteText: 'The last piece in this colour has a small mark, so we can send one less and offer a similar lawn suit at today\'s price instead.',
    });
  }
  const cancelledEntry = adjustable('CANCELLED', usedOrders);
  if (cancelledEntry) {
    usedOrders.add(cancelledEntry.order._id);
    const at = new Date(cancelledEntry.order.createdAt.getTime() + 2 * HOUR);
    addAdjustment({
      order: cancelledEntry.order, status: 'ORDER_CANCELLED', at, supplyAllBut: cancelledEntry.order.items[0].quantity,
      wantSubstitute: false, respondedAt: new Date(at.getTime() + 3 * HOUR), action: 'CANCEL_ORDER',
      responseNote: 'The customer preferred to cancel the whole order rather than take part of it.',
      restockRemoved: true, noteText: 'This fabric is out of stock until next week. We can send the rest of the order, or you can cancel it.',
    });
  }
  const pendingEntry = adjustable('PENDING', usedOrders);
  if (pendingEntry) {
    usedOrders.add(pendingEntry.order._id);
    const at = new Date(now.getTime() - 30 * HOUR);
    addAdjustment({
      order: pendingEntry.order, status: 'EXPIRED', at, supplyAllBut: 1, wantSubstitute: true,
      respondedAt: new Date(at.getTime() + 24 * HOUR), action: 'EXPIRED',
      noteText: 'One unit was damaged in the workshop. We can replace it with the same product in another shade.',
    });
  }

  // A picker found one unit missing and asked the customer. The order stays with
  // that picker, the line is short, and the proposal says a picker suggested it.
  const pickerEntry = orders.find(({ order, brand }) => brand.pickers.length
    && order.orderStatus === 'PROCESSING'
    && !order.activeAdjustmentId
    && !order.pickerId);
  if (pickerEntry) {
    const picker = pickerEntry.brand.pickers[0];
    const item = pickerEntry.order.items[0];
    const at = new Date(now.getTime() - 4 * HOUR);
    const supplied = Math.max(0, item.quantity - 1);
    pickerEntry.order.pickerId = picker._id;
    pickerEntry.order.pickStartedAt = new Date(at.getTime() - HOUR);
    pickerEntry.order.items.forEach((line, i) => {
      const units = i === 0 ? supplied : line.quantity;
      line.pickStatus = units === 0 ? 'UNAVAILABLE' : units < line.quantity ? 'SHORT' : 'PICKED';
      line.pickedQty = units;
    });
    usedOrders.add(pickerEntry.order._id);
    addAdjustment({
      order: pickerEntry.order, status: 'PROPOSED', at, supplyAllBut: 1, wantSubstitute: true,
      proposer: picker, proposerRole: 'PICKER',
      noteText: 'While picking your order I found one unit with a small mark. I can send the rest and offer a similar piece instead.',
    });
  }

  // ── reviews, written by customers whose orders were delivered ──
  const OPENERS = {
    5: ['Absolutely love it.', 'Better than I hoped.', 'Very happy with this order.'],
    4: ['Really good overall.', 'Happy with this.', 'Good quality and good service.'],
    3: ['It is fine.', 'Decent for the price.', 'Mixed feelings.'],
    2: ['Not quite what I expected.', 'A bit disappointed.'],
    1: ['I am very disappointed.', 'Would not buy again.'],
  };
  const TITLES = {
    5: ['Beautiful quality', 'Exactly as pictured', 'Worth every rupee', 'Highly recommended', 'Will order again'],
    4: ['Very good', 'Lovely, one small niggle', 'Happy with it', 'Good value'],
    3: ['Okay for the price', 'Decent, not amazing', 'Average'],
    2: ['Not as expected', 'Could be better'],
    1: ['Disappointed', 'Not as described'],
  };
  const CLOSERS = {
    5: ['Delivery was quick too.', 'I would recommend this seller.', 'Already planning my next order.'],
    4: ['Delivery was on time.', 'I would order again.'],
    3: ['It does the job.', 'Delivery was fine.'],
    2: ['Hoping the next one is better.', 'Delivery was on time at least.'],
    1: ['I would think twice before ordering.', 'I have contacted the seller.'],
  };
  // A customer reviews what they kept, never a unit the rider took back.
  const returnedUnits = new Map();
  for (const ret of ds.returns) {
    for (const line of ret.lines) {
      const key = String(line.orderItemId);
      returnedUnits.set(key, (returnedUnits.get(key) || 0) + line.quantity);
    }
  }
  const keptUnits = (item) => item.quantity - (returnedUnits.get(String(item._id)) || 0);

  const seenReviews = new Set();
  for (const { order, brand, events } of orders) {
    if (order.orderStatus !== 'DELIVERED') continue;
    const delivered = events[events.length - 1].at;
    for (const item of order.items) {
      if (keptUnits(item) <= 0) continue;
      const key = `${order.customerId}-${item.productId}`;
      if (seenReviews.has(key) || random() > 0.82) continue;
      seenReviews.add(key);

      const roll = random();
      const rating = brand.def.key === 'quick' ? (roll < 0.5 ? 1 : roll < 0.8 ? 2 : 3)
        : roll < 0.5 ? 5 : roll < 0.8 ? 4 : roll < 0.9 ? 3 : roll < 0.96 ? 2 : 1;
      const remarks = REMARKS[brand.def.key] || REMARKS.quick;
      const remark = pick(rating >= 4 ? remarks.good : remarks.bad);
      const comment = `${pick(OPENERS[rating])} ${remark} ${pick(CLOSERS[rating])}`;
      const reviewedAt = new Date(Math.min(now.getTime() - HOUR, delivered.getTime() + between(1, 6) * DAY));

      ds.reviews.push({
        _id: new ObjectId(), customerId: order.customerId, productId: item.productId, brandId: order.brandId, orderId: order._id,
        rating, title: pick(TITLES[rating]), comment, isApproved: random() < 0.9, createdAt: reviewedAt, updatedAt: reviewedAt,
      });
    }
  }

  // ── chats: customers asking brands about products ──
  const customerByEmail = Object.fromEntries(customers.map((c) => [c.email, c.doc]));
  const idAt = (at) => ObjectId.createFromTime(Math.floor(at.getTime() / 1000)); // message ids sort by time
  const buildChat = (chat, thread) => {
    const brand = brandByKey[chat.brand];
    const customer = customerByEmail[`${chat.customer}@citycart.demo`];
    const about = ds.products.find((p) => String(p.brandId) === String(brand.doc._id) && p.name.includes(chat.about));
    const replier = (brand.staff.find((s) => s.user.name === chat.by) || { user: brand.owner }).user;
    const conversationId = new ObjectId();

    const docs = thread.map(([who, text, minutesAgo], i) => {
      const at = new Date(now.getTime() - minutesAgo * 60 * 1000);
      return {
        _id: idAt(at), conversationId, senderId: who === 'c' ? customer._id : replier._id,
        senderRole: who === 'c' ? 'CUSTOMER' : 'BRAND', body: text, createdAt: at,
        ...(i === 0 && { productId: about._id }), // the product page the customer came from
      };
    });
    docs.forEach((d) => ds.messages.push(d));

    const last = docs[docs.length - 1];
    // The last run of messages from one side is unread by the other, if unseen.
    let run = 0;
    for (let i = docs.length - 1; i >= 0 && docs[i].senderRole === last.senderRole; i -= 1) run += 1;
    const unread = chat.unseen ? run : 0;
    ds.conversations.push({
      _id: conversationId, customerId: customer._id, brandId: brand.doc._id,
      lastMessageAt: last.createdAt, lastMessagePreview: last.body.slice(0, 100), lastSenderRole: last.senderRole,
      customerUnread: last.senderRole === 'BRAND' ? unread : 0,
      brandUnread: last.senderRole === 'CUSTOMER' ? unread : 0,
      createdAt: docs[0].createdAt, updatedAt: last.createdAt,
    });
  };
  CHATS.forEach((chat) => buildChat(chat, chat.thread));
  buildChat(LONG_CHAT, LONG_CHAT.pairs.flatMap(([ask, answer], i) => [['c', ask, 6000 - i * 90], ['b', answer, 6000 - i * 90 - 40]]));

  // ── notifications ──
  const note = (userId, type, title, message, data, at) => {
    const isRead = now - at > 3 * DAY;
    ds.notifications.push({
      _id: new ObjectId(), userId, type, title, message, data, isRead,
      // Read notifications also carry readAt (docs/12 §10), a moment after arrival.
      ...(isRead && { readAt: new Date(at.getTime() + 60 * 1000) }),
      createdAt: at,
    });
  };
  const brandReaders = (brand) => {
    const staff = brand.staff.find((s) => s.employee.isActive && s.employee.permissions.includes('orders.view'));
    return staff ? [brand.owner, staff.user] : [brand.owner];
  };

  // Service bookings keep the provider owner and the customer informed at every step.
  const serviceRef = (booking) => ({
    serviceBookingId: booking._id, bookingNumber: booking.bookingNumber, providerId: provider._id,
  });
  note(serviceOwner._id, 'SERVICE_BOOKING_REQUESTED', `New booking request ${requestedService.bookingNumber}`,
    `${customers[0].name} asked for ${requestedService.offering.title}. Accept it or propose another price and time.`,
    serviceRef(requestedService), ago(2 * HOUR));
  note(customers[1].doc._id, 'SERVICE_BOOKING_PROPOSED', 'Sana Home Cleaning sent a proposal',
    `${money(4800)} for "${proposedService.offering.title}". Accept or decline before it expires.`,
    serviceRef(proposedService), ago(5 * HOUR));
  note(serviceOwner._id, 'SERVICE_BOOKING_PROPOSAL_ANSWERED', 'Proposal declined',
    `${customers[9].name} declined the proposal for ${ds.serviceBookings[9].offering.title}.`,
    serviceRef(ds.serviceBookings[9]), ago(4 * DAY));
  note(customers[2].doc._id, 'SERVICE_BOOKING_ACCEPTED', 'Your booking is accepted',
    `Sana Home Cleaning accepted ${acceptedService.offering.title} at ${money(5000)}. You can chat about the job now.`,
    serviceRef(acceptedService), ago(DAY));
  note(customers[3].doc._id, 'SERVICE_BOOKING_STARTED', 'The provider has started',
    `Sana Home Cleaning started ${ds.serviceBookings[3].offering.title}.`,
    serviceRef(ds.serviceBookings[3]), ago(2 * HOUR));
  note(customers[4].doc._id, 'SERVICE_BOOKING_COMPLETED', 'The job is complete',
    `Sana Home Cleaning marked ${ds.serviceBookings[4].offering.title} complete at ${money(4700)}. Confirm it or raise a dispute.`,
    serviceRef(ds.serviceBookings[4]), ago(6 * HOUR));
  note(serviceOwner._id, 'SERVICE_BOOKING_CONFIRMED', 'Booking confirmed',
    `${customers[5].name} confirmed ${confirmedService.offering.title}. It now counts towards your ranking.`,
    serviceRef(confirmedService), ago(8 * DAY));
  note(serviceOwner._id, 'SERVICE_BOOKING_DISPUTED', 'A customer raised a dispute',
    `${customers[7].name} disputed the final amount on ${ds.serviceBookings[7].offering.title}. CityCart will review it.`,
    serviceRef(ds.serviceBookings[7]), ago(DAY));
  note(admin._id, 'SERVICE_BOOKING_DISPUTED', 'Service dispute needs review',
    `${customers[7].name} disputed booking ${ds.serviceBookings[7].bookingNumber}.`,
    serviceRef(ds.serviceBookings[7]), ago(DAY));
  note(customers[8].doc._id, 'SERVICE_BOOKING_CANCELLED', 'Booking cancelled',
    `Booking ${ds.serviceBookings[8].bookingNumber} was cancelled: Family emergency.`,
    serviceRef(ds.serviceBookings[8]), ago(DAY));
  note(serviceOwner._id, 'SERVICE_BOOKING_DECLINED', 'Proposal declined',
    `${customers[9].name} declined the proposal on ${ds.serviceBookings[9].bookingNumber}.`,
    serviceRef(ds.serviceBookings[9]), ago(4 * DAY));
  note(confirmedService.customerId, 'SERVICE_REVIEW_REPLIED', 'Sana Home Cleaning replied to your review',
    'Thank you! We are glad the kitchen came up so well.',
    serviceRef(confirmedService), ago(7 * DAY));

  for (const { order, payment, brand, customer, events } of orders) {
    const ref = { orderId: order._id, orderNumber: order.orderNumber, brandId: brand.doc._id };
    const units = order.items.reduce((n, i) => n + i.quantity, 0);
    for (const e of events) {
      const at = new Date(e.at.getTime() + 30 * 1000);
      switch (e.status) {
        case 'PENDING':
          brandReaders(brand).forEach((u) => note(u._id, 'ORDER_CREATED', `New order ${order.orderNumber}`, `${customer.name} ordered ${units} item${units === 1 ? '' : 's'} worth ${money(order.total)}. Confirm it to start preparing.`, ref, at));
          break;
        case 'CONFIRMED':
          note(customer.doc._id, 'ORDER_CONFIRMED', 'Your order is confirmed', `${brand.def.name} confirmed order ${order.orderNumber}. They will start preparing it now.`, ref, at);
          break;
        case 'PROCESSING':
          note(customer.doc._id, 'ORDER_PROCESSING', 'Your order is being prepared', `${brand.def.name} is packing order ${order.orderNumber}.`, ref, at);
          break;
        case 'SHIPPED':
          note(customer.doc._id, 'ORDER_SHIPPED', 'Your order has shipped', `Order ${order.orderNumber} is on its way from ${brand.def.name}.`, ref, at);
          break;
        case 'OUT_FOR_DELIVERY':
          note(customer.doc._id, 'ORDER_OUT_FOR_DELIVERY', 'Out for delivery today', `Order ${order.orderNumber} is out for delivery. Please keep ${money(order.total)} ready in cash.`, ref, at);
          break;
        case 'DELIVERED': {
          note(customer.doc._id, 'ORDER_DELIVERED', 'Your order was delivered', `Order ${order.orderNumber} has been delivered. We hope you love it. You can now leave a review.`, ref, at);
          const door = payment.collection && payment.collection.method !== 'CASH';
          const how = door ? { BANK_TRANSFER: 'bank transfer', WALLET: 'wallet', CARD_MACHINE: 'card machine' }[payment.collection.method] : '';
          note(brand.owner._id, 'PAYMENT_RECEIVED', door ? 'Payment received at the door' : 'Cash payment received',
            door
              ? `${money(payment.amount)} was paid by ${how} for order ${order.orderNumber}. Check the photo and the reference before you count it.`
              : `${money(payment.amount)} was collected on delivery for order ${order.orderNumber}.`,
            { ...ref, paymentId: payment._id }, at);
          break;
        }
        case 'RETURNED':
          note(customer.doc._id, 'ORDER_REJECTED', 'Your order went back with the rider',
            `Every item in order ${order.orderNumber} was refused at the door, so ${brand.def.name} took it back. You have not been charged.`,
            ref, at);
          break;
        case 'REJECTED':
          note(customer.doc._id, 'ORDER_REJECTED', 'Your order could not be fulfilled', `${brand.def.name} could not fulfil order ${order.orderNumber}. You have not been charged.`, ref, at);
          break;
        case 'CANCELLED':
          brandReaders(brand).forEach((u) => note(u._id, 'ORDER_CANCELLED', `Order ${order.orderNumber} was cancelled`, `${customer.name} cancelled the order before it was confirmed. Stock has been returned.`, ref, at));
          break;
        default:
      }
    }
    if (payment.refunds.length) {
      const refund = payment.refunds[0];
      note(customer.doc._id, 'REFUND_ISSUED', 'A refund was issued', `${brand.def.name} refunded ${money(refund.amount)} for order ${order.orderNumber}.`, { ...ref, paymentId: payment._id }, new Date(refund.at.getTime() + 60 * 1000));
    }
    if (payment.collection?.verification === 'SUBMITTED') {
      // A non-cash payment at the door: the delivery waits for this check.
      const delivery = deliveryOf(order);
      const how = { BANK_TRANSFER: 'bank transfer', WALLET: 'wallet', CARD_MACHINE: 'card machine' }[payment.collection.method];
      note(brand.owner._id, 'PAYMENT_PROOF_SUBMITTED', 'Payment to verify',
        `A ${how} payment of ${money(payment.amount)} for order ${order.orderNumber} is waiting for verification. The delivery completes once it is verified.`,
        { ...ref, paymentId: payment._id, orderNumber: order.orderNumber, amount: payment.amount, method: payment.collection.method },
        new Date(payment.collection.submittedAt.getTime() + 60 * 1000));
      if (delivery && delivery.riderId) {
        note(delivery.riderId, 'PAYMENT_PROOF_SUBMITTED', 'Payment sent for verification',
          `The ${how} payment for order ${order.orderNumber} is with the brand. The delivery completes once they check it.`,
          { ...ref, deliveryId: delivery._id, paymentId: payment._id }, new Date(payment.collection.submittedAt.getTime() + 60 * 1000));
      }
    }
    if (payment.collection?.verification === 'REJECTED') {
      const delivery = deliveryOf(order);
      note(brand.owner._id, 'PAYMENT_PROOF_REJECTED', 'Payment proof rejected',
        `The payment of ${money(payment.amount)} for order ${order.orderNumber} was rejected: ${payment.collection.note} The rider is asked to collect it again.`,
        { ...ref, paymentId: payment._id, orderNumber: order.orderNumber, amount: payment.amount, note: payment.collection.note },
        new Date(payment.collection.verifiedAt.getTime() + 60 * 1000));
      if (delivery && delivery.riderId) {
        note(delivery.riderId, 'PAYMENT_PROOF_REJECTED', 'Payment not verified — collect again',
          `The payment of ${money(payment.amount)} for order ${order.orderNumber} was not verified: ${payment.collection.note} Collect it again (cash or another method).`,
          { ...ref, deliveryId: delivery._id, paymentId: payment._id, amount: payment.amount, note: payment.collection.note },
          new Date(payment.collection.verifiedAt.getTime() + 60 * 1000));
      }
    }
  }

  // Adjustment nudges (docs/21 §H.4): the customer is asked, then the brand hears the answer.
  for (const adj of ds.orderAdjustments) {
    const entry = orderEntryById.get(String(adj.orderId));
    if (!entry) continue;
    const ref = { orderId: adj.orderId, orderNumber: entry.order.orderNumber, brandId: adj.brandId, adjustmentId: adj._id };
    note(adj.customerId, 'ADJUSTMENT_PROPOSED', 'A change to your order',
      `${entry.brand.def.name} cannot supply everything in order ${entry.order.orderNumber}. Review what they can send and choose what happens next.`,
      ref, new Date(adj.createdAt.getTime() + 60 * 1000));
    if (adj.status !== 'PROPOSED') {
      const expired = adj.status === 'EXPIRED';
      const message = expired
        ? `No answer was given to your proposed change on order ${entry.order.orderNumber} within 24 hours. The order was left unchanged.`
        : `${entry.customer.name} cancelled order ${entry.order.orderNumber} after your proposed change.`;
      brandReaders(entry.brand).forEach((u) => note(
        u._id, expired ? 'ADJUSTMENT_EXPIRED' : 'ADJUSTMENT_ANSWERED',
        expired ? 'A proposed change expired' : 'Customer answered your proposed change',
        message, ref, new Date(adj.respondedAt.getTime() + 60 * 1000)
      ));
    }
  }

  // Returned goods (docs/22 §F): the brand staff who handle orders or deliveries hear
  // while the goods are still with the rider, and again once the store has taken them in.
  for (const ret of ds.returns) {
    const entry = orderEntryById.get(String(ret.orderId));
    if (!entry) continue;
    const ref = {
      orderId: ret.orderId, orderNumber: entry.order.orderNumber, brandId: ret.brandId,
      returnId: ret._id, deliveryId: ret.deliveryId, lines: ret.lines.length, returnedSubtotal: ret.returnedSubtotal,
    };
    const received = ret.status === 'RECEIVED';
    const units = ret.lines.reduce((sum, line) => sum + line.quantity, 0);
    brandReaders(entry.brand).forEach((u) => note(
      u._id, 'RETURN_IN_TRANSIT',
      received ? 'Returned goods taken in' : 'Returned goods on the way',
      received
        ? `${units} refused unit${units === 1 ? '' : 's'} from order ${entry.order.orderNumber} were taken in. Decide what goes back on sale.`
        : `${units} refused unit${units === 1 ? '' : 's'} from order ${entry.order.orderNumber} are coming back with the rider.`,
      ref, new Date(ret.updatedAt.getTime() + 60 * 1000)
    ));
  }

  const productById = new Map(ds.products.map((p) => [String(p._id), p]));
  for (const inv of ds.inventories) {
    const brand = brands.find((b) => String(b.doc._id) === String(inv.brandId));
    const product = productById.get(String(inv.productId));
    if (!inv.trackInventory || product.status !== 'ACTIVE' || brand.doc.status !== 'ACTIVE') continue;
    if (inv.quantity === 0) {
      note(brand.owner._id, 'OUT_OF_STOCK', `${product.name} is out of stock`, 'Customers cannot order it until you add stock.', { productId: product._id, brandId: brand.doc._id }, ago(between(4, 40) * HOUR));
    } else if (inv.quantity <= inv.lowStockThreshold) {
      note(brand.owner._id, 'LOW_STOCK', `Low stock: ${product.name}`, `Only ${inv.quantity} left, and your warning level is ${inv.lowStockThreshold}.`, { productId: product._id, brandId: brand.doc._id }, ago(between(4, 40) * HOUR));
    }
  }
  // Brand staff hear about new reviews (docs/12 §6) — one notification per review.
  for (const r of ds.reviews) {
    const brand = brands.find((b) => String(b.doc._id) === String(r.brandId));
    if (!brand) continue;
    const product = productById.get(String(r.productId));
    note(brand.owner._id, 'NEW_REVIEW', `New ${r.rating}-star review`,
      `A customer reviewed ${product ? product.name : 'a product'}: "${r.title}".`,
      { productId: r.productId, brandId: r.brandId, rating: r.rating },
      new Date(r.createdAt.getTime() + 60 * 1000));
  }
  for (const brand of brands) {
    for (const s of brand.staff) {
      note(brand.owner._id, 'EMPLOYEE_CREATED', `${s.user.name} joined your team`, `${s.user.name} was added as ${s.employee.jobTitle}. Review what they can do on the Team page.`, { employeeId: s.employee._id, brandId: brand.doc._id }, new Date(s.joined.getTime() + 60 * 1000));
      if (s.changed) {
        note(s.user._id, 'EMPLOYEE_PERMISSION_CHANGED', 'Your access was updated', `${brand.def.name} changed what you can do on the dashboard.`, { brandId: brand.doc._id }, new Date(s.joined.getTime() + 9 * DAY));
      }
    }
    note(brand.owner._id, 'SYSTEM_NOTIFICATION', 'Welcome to CityCart', 'Your brand account is ready. Add a category, then your first products.', { brandId: brand.doc._id }, new Date(brand.doc.createdAt.getTime() + 5 * 60 * 1000));
  }
  // Riders hear about the deliveries they are given (only those that are still open).
  for (const d of ds.deliveries) {
    if (!d.riderId || ['DELIVERED', 'CANCELLED', 'RETURNED'].includes(d.status)) continue;
    const order = ds.orders.find((o) => String(o._id) === String(d.orderId));
    note(d.riderId, 'DELIVERY_ASSIGNED', 'New delivery', `You have been assigned the delivery for order ${order.orderNumber}.`,
      { brandId: d.brandId, deliveryId: d._id, orderNumber: order.orderNumber }, d.assignedAt);
  }
  customers.forEach((c) => note(c.doc._id, 'SYSTEM_NOTIFICATION', 'Welcome to CityCart', 'Shop local brands in your city and pay in cash when your order arrives.', { kind: 'welcome' }, new Date(c.doc.createdAt.getTime() + 5 * 60 * 1000)));

  // ── seller billing (docs/15, docs/24 §5) ──
  // One 1% commission ledger, monthly invoices in every state, receipt claims
  // and help requests, so both the seller page and the admin console have data.
  const loom = brandByKey.loom;
  const rangrez = brandByKey.rangrez;
  const sukoon = brandByKey.sukoon;
  const zaitoon = brandByKey.zaitoon;

  const currentMonthStart = startOfKarachiMonth(now);
  const lastMonthStart = startOfKarachiMonth(new Date(currentMonthStart.getTime() - 1));
  const monthBeforeStart = startOfKarachiMonth(new Date(lastMonthStart.getTime() - 1));
  const RATE_BPS = 100;
  const commissionOf = (paisa) => Math.floor((paisa * RATE_BPS + 5000) / 10000);

  const addInvoice = ({
    sellerType, sellerId, start, end, status, salesPaisa, commissionPaisa,
    creditsPaisa = 0, paidPaisa = 0, issuedAt, dueAt, paidAt = null, createdBy = 'SYSTEM',
  }) => {
    const doc = {
      _id: new ObjectId(), sellerType, sellerId, periodStart: start, periodEnd: end,
      periodKey: karachiMonthKey(start), salesPaisa, commissionPaisa, creditsPaisa, paidPaisa,
      amountDuePaisa: Math.max(0, commissionPaisa - creditsPaisa - paidPaisa),
      status, issuedAt, dueAt, paidAt, createdBy, currency: 'PKR', createdAt: issuedAt, updatedAt: issuedAt,
    };
    ds.sellerInvoices.push(doc);
    return doc;
  };

  const loomAugust = addInvoice({
    sellerType: 'BRAND', sellerId: loom.doc._id, start: monthBeforeStart, end: lastMonthStart,
    status: 'PAID', salesPaisa: 12000000, commissionPaisa: 120000, paidPaisa: 120000,
    issuedAt: lastMonthStart, dueAt: new Date(lastMonthStart.getTime() + 7 * DAY),
    paidAt: new Date(lastMonthStart.getTime() + 2 * DAY),
  });
  const loomSeptember = addInvoice({
    sellerType: 'BRAND', sellerId: loom.doc._id, start: lastMonthStart, end: currentMonthStart,
    status: 'OVERDUE', salesPaisa: 21000000, commissionPaisa: 210000, creditsPaisa: 5000, paidPaisa: 90000,
    issuedAt: currentMonthStart, dueAt: new Date(now.getTime() - 2 * DAY),
  });
  const rangrezInvoice = addInvoice({
    sellerType: 'BRAND', sellerId: rangrez.doc._id, start: monthBeforeStart, end: lastMonthStart,
    status: 'OVERDUE', salesPaisa: 9600000, commissionPaisa: 96000,
    issuedAt: lastMonthStart, dueAt: new Date(now.getTime() - 10 * DAY),
  });
  const sukoonInvoice = addInvoice({
    sellerType: 'BRAND', sellerId: sukoon.doc._id, start: monthBeforeStart, end: lastMonthStart,
    status: 'OVERDUE', salesPaisa: 6400000, commissionPaisa: 64000,
    issuedAt: lastMonthStart, dueAt: new Date(now.getTime() - 15 * DAY),
  });
  addInvoice({
    sellerType: 'BRAND', sellerId: zaitoon.doc._id, start: monthBeforeStart, end: lastMonthStart,
    status: 'VOID', salesPaisa: 3000000, commissionPaisa: 30000,
    issuedAt: lastMonthStart, dueAt: new Date(lastMonthStart.getTime() + 7 * DAY),
    createdBy: admin._id.toString(),
  });
  const providerInvoice = addInvoice({
    sellerType: 'SERVICE_PROVIDER', sellerId: provider._id, start: lastMonthStart, end: currentMonthStart,
    status: 'ISSUED', salesPaisa: 440000, commissionPaisa: 4400,
    issuedAt: currentMonthStart, dueAt: new Date(now.getTime() + 5 * DAY),
  });

  const addEntry = ({
    sellerType, sellerId, sourceType, sourceId, eligibleAmountPaisa, kind = 'SALE', status,
    occurredAt, invoiceId = null, reversalOf = null, reason,
  }) => {
    const amount = commissionOf(eligibleAmountPaisa);
    const doc = {
      _id: new ObjectId(), sellerType, sellerId, sourceType, sourceId, eligibleAmountPaisa,
      rateBps: RATE_BPS, commissionPaisa: kind === 'REVERSAL' ? -amount : amount, kind, status,
      occurredAt, invoiceId, reversalOf, reason, currency: 'PKR', createdAt: occurredAt, updatedAt: occurredAt,
    };
    ds.commissionEntries.push(doc);
    return doc;
  };

  const deliveredAtOf = (order) => {
    const event = order.statusHistory.find((s) => s.status === 'DELIVERED');
    return event ? event.at : order.updatedAt;
  };
  const loomDelivered = ds.orders
    .filter((o) => String(o.brandId) === String(loom.doc._id) && o.orderStatus === 'DELIVERED')
    .sort((a, b) => a.createdAt - b.createdAt);
  const billableBase = (order) =>
    Math.round(Math.max(0, order.netTotal - order.deliveryFee - order.tax) * 100);
  const [paidSale, invoicedSale, reversedSale] = loomDelivered.slice(0, 3);
  addEntry({
    sellerType: 'BRAND', sellerId: loom.doc._id, sourceType: 'ORDER', sourceId: paidSale._id,
    eligibleAmountPaisa: billableBase(paidSale), status: 'PAID', occurredAt: deliveredAtOf(paidSale),
    invoiceId: loomAugust._id, reason: '1% commission on a delivered order.',
  });
  addEntry({
    sellerType: 'BRAND', sellerId: loom.doc._id, sourceType: 'ORDER', sourceId: invoicedSale._id,
    eligibleAmountPaisa: billableBase(invoicedSale), status: 'INVOICED', occurredAt: deliveredAtOf(invoicedSale),
    invoiceId: loomSeptember._id, reason: '1% commission on a delivered order.',
  });
  const reversedEntry = addEntry({
    sellerType: 'BRAND', sellerId: loom.doc._id, sourceType: 'ORDER', sourceId: reversedSale._id,
    eligibleAmountPaisa: billableBase(reversedSale), status: 'REVERSED', occurredAt: deliveredAtOf(reversedSale),
    invoiceId: loomAugust._id, reason: 'Order returned after delivery; the charge was reversed.',
  });
  addEntry({
    sellerType: 'BRAND', sellerId: loom.doc._id, sourceType: 'ORDER', sourceId: reversedSale._id,
    eligibleAmountPaisa: billableBase(reversedSale), kind: 'REVERSAL', status: 'REVERSED',
    occurredAt: new Date(deliveredAtOf(reversedSale).getTime() + 2 * DAY), invoiceId: loomSeptember._id,
    reversalOf: reversedEntry._id, reason: 'Reversal of the charge for a returned order.',
  });
  if (loomDelivered[3]) {
    addEntry({
      sellerType: 'BRAND', sellerId: loom.doc._id, sourceType: 'ORDER', sourceId: loomDelivered[3]._id,
      eligibleAmountPaisa: billableBase(loomDelivered[3]), status: 'ACCRUED',
      occurredAt: deliveredAtOf(loomDelivered[3]), reason: '1% commission on a delivered order.',
    });
  }
  addEntry({
    sellerType: 'SERVICE_PROVIDER', sellerId: provider._id, sourceType: 'SERVICE_BOOKING',
    sourceId: confirmedService._id, eligibleAmountPaisa: confirmedService.finalAmountPaisa ?? confirmedService.agreedPricePaisa,
    status: 'INVOICED', occurredAt: confirmedService.confirmedAt, invoiceId: providerInvoice._id,
    reason: '1% commission on a confirmed booking.',
  });

  const addClaim = ({
    invoiceId, sellerType, sellerId, amountPaisa, method, reference, receiptId, comment, status,
    verifiedBy = null, verifiedAt = null, rejectionReason = '', creditPaisa = 0, creditAppliedInvoiceId = null, at,
  }) => {
    const doc = {
      _id: new ObjectId(), invoiceId, sellerType, sellerId, amountPaisa, method, reference,
      receipt: { publicId: receiptId, fingerprint: `${receiptId.replace(/[^a-z0-9]+/gi, '-')}-fp` },
      comment, status, verifiedBy, verifiedAt, rejectionReason, creditPaisa, creditAppliedInvoiceId,
      currency: 'PKR', createdAt: at, updatedAt: verifiedAt || at,
    };
    ds.sellerPaymentClaims.push(doc);
    return doc;
  };
  const loomReceipt = `citycart/billing/brands/${loom.doc._id}/receipts`;
  addClaim({
    invoiceId: loomAugust._id, sellerType: 'BRAND', sellerId: loom.doc._id, amountPaisa: 125000,
    method: 'BANK_TRANSFER', reference: 'MCB-2026-0902-8841', receiptId: `${loomReceipt}/loom-august-2026`,
    comment: 'Paid in full plus an extra PKR 50; keep the difference as credit.', status: 'VERIFIED',
    verifiedBy: admin._id, verifiedAt: new Date(lastMonthStart.getTime() + 3 * DAY),
    creditPaisa: 5000, creditAppliedInvoiceId: loomSeptember._id,
    at: new Date(lastMonthStart.getTime() + 2 * DAY),
  });
  addClaim({
    invoiceId: loomSeptember._id, sellerType: 'BRAND', sellerId: loom.doc._id, amountPaisa: 90000,
    method: 'JAZZCASH', reference: 'JC-4471-2201', receiptId: `${loomReceipt}/loom-september-part`,
    comment: 'Part payment while the rest is on the way.', status: 'SUBMITTED', at: ago(DAY),
  });
  addClaim({
    invoiceId: sukoonInvoice._id, sellerType: 'BRAND', sellerId: sukoon.doc._id, amountPaisa: 30000,
    method: 'EASYPAISA', reference: 'EP-9932-1180', receiptId: `citycart/billing/brands/${sukoon.doc._id}/receipts/sukoon-august`,
    comment: 'Sent the amount we agreed on the phone.', status: 'REJECTED',
    verifiedBy: admin._id, verifiedAt: ago(2 * DAY),
    rejectionReason: 'The reference number does not match any CityCart payment.', at: ago(5 * DAY),
  });

  const addHelp = ({ sellerType, sellerId, subject, message, status, resolutionNote = '', handledBy = null, handledAt = null, at }) => {
    ds.billingHelpRequests.push({
      _id: new ObjectId(), sellerType, sellerId, subject, message, status, resolutionNote,
      handledBy, handledAt, createdAt: at, updatedAt: handledAt || at,
    });
  };
  addHelp({
    sellerType: 'BRAND', sellerId: loom.doc._id,
    subject: 'Bank account title for the transfer',
    message: 'Our bank account title differs from the brand name. Can we still send the September payment from it?',
    status: 'OPEN', at: ago(6 * HOUR),
  });
  addHelp({
    sellerType: 'BRAND', sellerId: rangrez.doc._id,
    subject: 'Card machine sales are split with a partner',
    message: 'Half of our card sales settle to a partner account. Which amount should the 1% be calculated on?',
    status: 'RESOLVED',
    resolutionNote: 'The 1% is on the full completed order; where the money settles does not change the charge.',
    handledBy: admin._id, handledAt: ago(3 * DAY), at: ago(5 * DAY),
  });
  addHelp({
    sellerType: 'SERVICE_PROVIDER', sellerId: provider._id,
    subject: 'Invoice for a disputed booking',
    message: 'A customer disputed the final amount. Will the commission be recalculated if the dispute is settled lower?',
    status: 'OPEN', at: ago(4 * HOUR),
  });

  note(loom.owner._id, 'BILLING_WARNING', 'Your CityCart bill is 2 days past due',
    `Invoice ${loomSeptember.periodKey} has ${money((loomSeptember.amountDuePaisa) / 100)} still to pay. New orders are still accepted until day 7.`,
    { invoiceId: loomSeptember._id, sellerType: 'BRAND' }, ago(2 * DAY));
  note(loom.owner._id, 'BILLING_CLAIM_VERIFIED', 'Your payment was verified',
    `We received ${money(1250)} for invoice ${loomAugust.periodKey}. PKR 50 is kept as credit for your next bill.`,
    { invoiceId: loomAugust._id, claimId: ds.sellerPaymentClaims[0]._id }, ago(1.5 * DAY));
  note(sukoon.owner._id, 'BILLING_CLAIM_REJECTED', 'Your payment could not be matched',
    'The reference number does not match any CityCart payment. Please check it and send the claim again.',
    { invoiceId: sukoonInvoice._id, claimId: ds.sellerPaymentClaims[2]._id }, ago(2 * DAY));
  note(rangrez.owner._id, 'BILLING_HELP_ANSWERED', 'CityCart answered your billing question',
    'The 1% is on the full completed order; where the money settles does not change the charge.',
    { sellerType: 'BRAND' }, ago(3 * DAY));
  note(rangrez.owner._id, 'BILLING_RESTRICTED', 'New orders are paused on your account',
    `Invoice ${rangrezInvoice.periodKey} is 10 days past due. Existing orders can still be fulfilled, and listing stays visible.`,
    { invoiceId: rangrezInvoice._id, sellerType: 'BRAND' }, ago(DAY));
  note(sukoon.owner._id, 'BILLING_FROZEN', 'Your listings are hidden',
    `Invoice ${sukoonInvoice.periodKey} is 15 days past due. Customers cannot find your products until it is settled.`,
    { invoiceId: sukoonInvoice._id, sellerType: 'BRAND' }, ago(3 * DAY));

  return ds;
}

module.exports = { buildDataset, money };