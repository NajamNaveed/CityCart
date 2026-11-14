const { z } = require('zod');

const Category = require('../../../models/category.model');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildListingMessages } = require('../prompts/listing.prompt');

/**
 * Drafts a catalogue entry from a few words (docs/29 Phase 1a).
 *
 * The model never sees or creates ids: it picks from the leaf categories loaded
 * here, and the id is resolved against that list before it reaches the client.
 * The brand edits everything and still submits the normal request afterwards.
 */
const modelSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(800),
  category: z.string().trim().max(160),
});

const NOTES_LIMIT = 400;

async function loadLeafCategories() {
  const categories = await Category.find({ isActive: true }).select('name parentId').lean();
  const parents = new Set(
    categories.filter((category) => category.parentId).map((category) => String(category.parentId)),
  );
  return categories
    .filter((category) => !parents.has(String(category._id)))
    .map((category) => ({ id: String(category._id), name: category.name }));
}

function resolveCategory(value, categories) {
  const answer = value.trim();
  return (
    categories.find((category) => category.id === answer) ||
    categories.find((category) => category.name.toLowerCase() === answer.toLowerCase()) ||
    null
  );
}

async function draftListing({ notes, ctx }) {
  const cleanNotes = sanitizeUserText(notes, NOTES_LIMIT);
  const categories = await loadLeafCategories();

  const result = await generate({
    task: 'listing-draft',
    messages: buildListingMessages({ notes: cleanNotes, categories }),
    json: true,
    temperature: 0.4,
    maxTokens: 600,
    userId: ctx.userId,
    role: ctx.role,
  });

  const parsed = parseModelJson(result.text, modelSchema);
  const category = resolveCategory(parsed.category, categories);

  return {
    title: parsed.title,
    description: parsed.description,
    category: category ? { id: category.id, name: category.name } : null,
  };
}

module.exports = { draftListing, NOTES_LIMIT };
