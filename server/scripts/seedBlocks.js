/**
 * Dev seed: Faisalabad's blocks (neighbourhoods) for location-based discovery.
 * Idempotent (existing blocks are left untouched). Refuses to run in production.
 *
 *   npm run seed:blocks
 *
 * Reads scripts/data/faisalabad-blocks.json. IMPORTANT: the shipped
 * coordinates are APPROXIMATE (hand-placed, each marked "approximate": true).
 * Correct them in Admin -> Blocks (right-click a spot in Google Maps, copy the
 * "lat, lng" pair, paste it there) or edit the JSON before seeding. A block's
 * centre decides which block a shopper is matched to, so accuracy matters.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const City = require('../src/models/city.model');
const Block = require('../src/models/block.model');
const { slugify } = require('../src/utils/slugify');
const { pointFromLatLng } = require('../src/utils/geo');
const blocks = require('./data/faisalabad-blocks.json');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set (server/.env).');
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  let city = await City.findOne({ slug: 'faisalabad' });
  if (!city) {
    city = await City.create({ name: 'Faisalabad', slug: 'faisalabad', state: 'Punjab', country: 'Pakistan' });
    console.log('Created city Faisalabad.');
  }

  let created = 0;
  for (const entry of blocks) {
    const slug = slugify(entry.name);
    const exists = await Block.findOne({ cityId: city._id, slug });
    if (exists) {
      console.log(`  exists   ${entry.name}`);
      continue;
    }
    await Block.create({
      cityId: city._id,
      name: entry.name,
      slug,
      center: pointFromLatLng(entry.latitude, entry.longitude),
    });
    created += 1;
    console.log(`  created  ${entry.name}${entry.approximate ? '  (approximate coordinates)' : ''}`);
  }

  console.log(`\nDone: ${created} block(s) created.`);
  if (created > 0) {
    console.log('Coordinates are approximate — verify them in Admin -> Blocks before relying on them.');
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
