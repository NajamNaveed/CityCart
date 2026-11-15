const { z } = require('zod');

const { getPublicCategoryTree } = require('../../category.service');

const MAX_CATEGORIES = 80;

function flatten(nodes, parentName, out) {
  for (const node of nodes) {
    if (out.length >= MAX_CATEGORIES) return;
    out.push({
      _id: String(node._id),
      name: node.name,
      parent: parentName || null,
      hasChildren: Array.isArray(node.children) && node.children.length > 0,
    });
    if (node.children && node.children.length > 0) {
      flatten(node.children, node.name, out);
    }
  }
}

/** The active category tree, flattened for the prompt. */
const categoryTool = {
  name: 'list_categories',
  argsHint: '{}',
  description:
    'List the active shopping categories. Use it when the shopper asks what the marketplace sells or when you need the right words for a product search.',
  argsSchema: z.object({}).strict(),
  async run() {
    const tree = await getPublicCategoryTree();
    const items = [];
    flatten(tree, null, items);
    return { count: items.length, items };
  },
};

module.exports = categoryTool;
