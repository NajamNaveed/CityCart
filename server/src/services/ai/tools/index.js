const productTool = require('./product.tool');
const categoryTool = require('./category.tool');
const storeTool = require('./store.tool');
const { listOrdersTool, getOrderTool } = require('./order.tools');
const {
  findProvidersTool,
  listCategoriesTool,
  providerSlotsTool,
} = require('./service.tool');

/**
 * Read-only tool layer for the customer assistants (docs/27 §3.4).
 *
 * A tool receives a request-scoped context and the model's arguments, runs
 * ordinary database reads and returns plain JSON for the prompt. Tools never
 * accept ids from the model: the caller's identity, city and coordinates come
 * from `ctx`, which the controller builds from the authenticated request.
 *
 * Records a tool found are also remembered in `ctx`, so the agent can only
 * show cards that came from a real query (the model may not invent products,
 * orders or providers by returning an id of its own).
 */
function createToolContext({ userId, role, cityId = null, lat = null, lng = null }) {
  return {
    userId,
    role,
    cityId,
    lat,
    lng,
    products: new Map(),
    orders: new Map(),
    providers: new Map(),
    slots: new Map(),
    rememberProduct(card) {
      this.products.set(String(card._id), card);
      return card;
    },
    rememberOrder(card) {
      this.orders.set(String(card.orderId), card);
      return card;
    },
    rememberProvider(card) {
      this.providers.set(String(card.providerId), card);
      return card;
    },
    rememberSlots(providerId, offerings) {
      this.slots.set(String(providerId), offerings);
      return offerings;
    },
  };
}

const TOOLS = {
  [productTool.name]: productTool,
  [categoryTool.name]: categoryTool,
  [storeTool.name]: storeTool,
  [listOrdersTool.name]: listOrdersTool,
  [getOrderTool.name]: getOrderTool,
  [findProvidersTool.name]: findProvidersTool,
  [listCategoriesTool.name]: listCategoriesTool,
  [providerSlotsTool.name]: providerSlotsTool,
};

const SHOP_TOOLS = [productTool, categoryTool, storeTool];
const ORDER_TOOLS = [listOrdersTool, getOrderTool];
const SERVICE_TOOLS = [findProvidersTool, listCategoriesTool, providerSlotsTool];

/** The tool list as it appears in the system prompt. */
function describeTools(tools) {
  return tools
    .map((tool) => `- ${tool.name}(${tool.argsHint}) — ${tool.description}`)
    .join('\n');
}

function findTool(name) {
  return TOOLS[name] || null;
}

module.exports = {
  createToolContext,
  describeTools,
  findTool,
  SHOP_TOOLS,
  ORDER_TOOLS,
  SERVICE_TOOLS,
};
