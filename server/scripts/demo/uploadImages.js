/**
 * Uploads the product photos under the repository's Images/ directory to Cloudinary
 * and returns the URLs grouped by folder name, so scripts/demo/catalog.js can point a
 * listing at real photography instead of a generated link.
 *
 *   Images/<Product Name>/1.jpg 2.jpg 3.jpg   ->  one listing, one gallery
 *
 * Signed direct upload, the same scheme the API uses for brand uploads
 * (src/services/upload.service.js): no SDK, no secret in the URL. Results are cached in
 * .image-cache.json (gitignored, like every upload folder here), so seeding twice does
 * not upload twice. A cached link is reused only while the local file has the same size
 * and modified time, so replacing a photo re-uploads just that photo.
 *
 * Nothing here is required to run the seed: when Images/ is missing, Cloudinary is not
 * configured, or SEED_IMAGES is set, the listings keep their placeholder links and the
 * seed says why it skipped the photos.
 */
const fs = require('fs');
const path = require('path');

const env = require('../../src/config/env');
const { isConfigured, signParams, ALLOWED_FORMATS } = require('../../src/services/upload.service');

const IMAGES_ROOT = path.resolve(__dirname, '../../../Images');
const CACHE_FILE = path.resolve(__dirname, '.image-cache.json');
const FOLDER_PREFIX = 'citycart/demo';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const CONCURRENCY = 4;

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Walks subdirectories too, so Images/kitchen/boards keys as "kitchen/boards",
// exactly as a catalog's `folder` field names it.
function foldersWithImages(root) {
  const folders = new Map();
  const walk = (dir) => {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
    if (files.length) {
      const key = path.relative(root, dir).replace(/\\/g, '/') || path.basename(root);
      folders.set(key, files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    }
  };
  walk(root);
  return folders;
}

/**
 * Why the real photos can or cannot be used for this run. Returning the reason instead of
 * throwing is what lets the seed fall back to placeholder links with one printed line.
 *
 * `requested` is the folder names the catalog actually points at; without it every photo
 * under Images/ would be uploaded on every seed, including the ones no listing uses.
 */
function planImages({ root = IMAGES_ROOT, config = env.cloudinary, requested = null } = {}) {
  const skipped = (reason, extra = {}) => ({ ready: false, reason, ...extra });
  if (!fs.existsSync(root)) return skipped(`no Images/ directory at ${root}`);
  const all = foldersWithImages(root);
  const missing = (requested || []).filter((name) => !all.has(name));
  const folders = requested ? new Map([...all].filter(([name]) => requested.includes(name))) : all;
  if (folders.size === 0) {
    return skipped(requested
      ? `none of the ${requested.length} photo folder(s) the catalog asks for is in ${root}`
      : `${root} has no folders with product photos`, { missing });
  }
  if (!isConfigured(config)) {
    return skipped('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)', { missing });
  }
  if (typeof fetch !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
    return skipped('this Node version cannot upload images (needs fetch, FormData and Blob — use Node 18 or newer)', { missing });
  }
  const count = [...folders.values()].reduce((n, list) => n + list.length, 0);
  return { ready: true, folders, count, missing, reason: `${count} photo(s) in ${folders.size} folder(s)` };
}

async function uploadOne(file, folder, config, fetchImpl) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { allowed_formats: ALLOWED_FORMATS, folder, timestamp };
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'application/octet-stream' }), path.basename(file));
  form.append('api_key', config.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('allowed_formats', ALLOWED_FORMATS);
  form.append('signature', signParams(signed, config.apiSecret));

  const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) {
    throw new Error(`Cloudinary rejected ${path.basename(file)}: ${body.error && body.error.message ? body.error.message : response.status}`);
  }
  return body.secure_url;
}

function loadCache(cacheFile) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Returns { folderName: [url, ...] } for every folder under Images/ the catalog asks for.
 * A cached URL is reused when the local file has not changed, so a reseed uploads only
 * what is new.
 */
async function collectImageUrls({
  root = IMAGES_ROOT, cacheFile = CACHE_FILE, folderPrefix = FOLDER_PREFIX, requested = null,
  config = env.cloudinary, fetchImpl = global.fetch, log = console.log,
} = {}) {
  const plan = planImages({ root, config, requested });
  if (!plan.ready) throw new Error(`Cannot use the real product photos: ${plan.reason}.`);

  const cache = loadCache(cacheFile);
  const jobs = [];
  for (const [name, files] of plan.folders) {
    for (const file of files) jobs.push({ name, file, key: path.relative(root, file).replace(/\\/g, '/') });
  }

  let uploaded = 0;
  let reused = 0;
  const results = new Map();
  const pending = [...jobs];

  const worker = async () => {
    while (pending.length) {
      const job = pending.shift();
      const stat = fs.statSync(job.file);
      const cached = cache[job.key];
      if (cached && cached.size === stat.size && cached.mtimeMs === Math.round(stat.mtimeMs)) {
        reused += 1;
        if (!results.has(job.name)) results.set(job.name, []);
        results.get(job.name).push({ file: job.file, url: cached.url });
        continue;
      }
      const url = await uploadOne(job.file, `${folderPrefix}/${slug(job.name)}`, config, fetchImpl);
      uploaded += 1;
      cache[job.key] = { size: stat.size, mtimeMs: Math.round(stat.mtimeMs), url };
      if (!results.has(job.name)) results.set(job.name, []);
      results.get(job.name).push({ file: job.file, url });
      log(`  uploaded ${job.key}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  log(`Photos: ${uploaded} uploaded, ${reused} reused from cache, ${jobs.length} total.`);

  const byFolder = {};
  for (const [name, entries] of results) {
    byFolder[name] = entries
      .sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }))
      .map((entry) => entry.url);
  }
  return byFolder;
}

module.exports = { IMAGES_ROOT, CACHE_FILE, FOLDER_PREFIX, planImages, collectImageUrls, foldersWithImages };

if (require.main === module) {
  collectImageUrls()
    .then((urls) => {
      for (const [folder, list] of Object.entries(urls)) console.log(`${folder}: ${list.length} image(s)`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
