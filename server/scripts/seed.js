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
const Block = require('../src/models/block.model');
const ServiceCategory = require('../src/models/serviceCategory.model');
const ServiceProvider = require('../src/models/serviceProvider.model');
const ServiceOffering = require('../src/models/serviceOffering.model');
const { hashPassword } = require('../src/utils/password');
const { slugify } = require('../src/utils/slugify');
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

  // Provider onboarding needs at least one active category to choose from
  // (docs/24 §4.2). The full catalogue tree arrives with discovery in 2b.
  const categories = {};
  const categoryNames = ['Home Cleaning', 'Plumbing', 'Electrical', 'Repairs & Maintenance'];
  for (const [order, name] of categoryNames.entries()) {
    const slug = slugify(name);
    const category = await getOrCreate(ServiceCategory, { slug }, { name, slug, order });
    categories[slug] = category.doc;
    log.push([`service category: ${name}`, category]);
  }

  // A published provider with a small catalogue so discovery and the public
  // page can be tried after `npm run seed` + `npm run seed:blocks`.
  const block = await Block.findOne({ cityId: city.doc._id, isActive: true }).sort({ name: 1 });
  if (!block) {
    console.log('No active block in Faisalabad — run `npm run seed:blocks` to seed the provider too.');
  } else {
    const servicePw = process.env.SEED_SERVICE_PASSWORD || 'Service@12345';
    const owner = await getOrCreate(User, { email: 'service@citycart.local', role: ROLES.SERVICE_PROVIDER }, {
      name: 'Sana Khalid', email: 'service@citycart.local',
      passwordHash: await hashPassword(servicePw), role: ROLES.SERVICE_PROVIDER,
      emailVerifiedAt: new Date(),
    });
    log.push(['service owner', owner]);

    const provider = await getOrCreate(ServiceProvider, { slug: 'sana-home-cleaning-demo' }, {
      userId: owner.doc._id,
      displayName: 'Sana Home Cleaning',
      legalName: 'Sana Home Cleaning Services',
      slug: 'sana-home-cleaning-demo',
      categoryId: categories['home-cleaning']._id,
      cityId: city.doc._id,
      blockId: block._id,
      location: { type: 'Point', coordinates: block.center.coordinates },
      addressLine: 'Seeded demo provider',
      phone: '03001234567',
      bio: 'Reliable home cleaning in Faisalabad — deep cleans, sofas and move-in jobs.',
      avatar: 'https://picsum.photos/seed/citycart-provider-avatar/200/200',
      coverImage: 'https://picsum.photos/seed/citycart-provider-cover/1200/600',
      startingAtPrice: 250000,
      status: 'ACTIVE',
      verification: 'VERIFIED',
      ratingAvg: 4.8,
      ratingCount: 24,
      completedBookings: 30,
      rankScore: 30,
      blockChangedAt: new Date(),
      blockHistory: [{ blockId: block._id, changedAt: new Date(), changedBy: superAdmin.doc._id }],
      approvedBy: superAdmin.doc._id,
      approvedAt: new Date(),
    });
    log.push(['service provider', provider]);

    const offerings = [
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
    for (const [index, offering] of offerings.entries()) {
      log.push([
        `service offering: ${offering.title}`,
        await getOrCreate(ServiceOffering, { providerId: provider.doc._id, slug: offering.slug }, {
          ...offering,
          providerId: provider.doc._id,
          categoryId: categories['home-cleaning']._id,
          images: [`https://picsum.photos/seed/citycart-service-${index + 1}/900/600`],
        }),
      ]);
    }
  }

  log.forEach(([n, r]) => console.log(`${r.created ? 'created' : 'exists '}  ${n}`));
  console.log(
    '\nLogins:\n  admin@citycart.local / Admin@12345\n  brand@citycart.local / Brand@12345' +
      (block ? '\n  service@citycart.local / Service@12345' : '')
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());