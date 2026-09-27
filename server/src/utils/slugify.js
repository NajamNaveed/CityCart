/**
 * Minimal slug generator (no external dependency — the transformation is
 * a few lines and doesn't warrant adding a package). Used to derive
 * City/Brand slugs from a name at creation time; slugs are never
 * accepted directly from client input (see the respective validators).
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };