process.env.AI_ENABLED = 'true';
process.env.AI_PROVIDER_ORDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../../src/models/user.model');
jest.mock('../../src/models/employee.model');
jest.mock('../../src/models/aiUsage.model', () => ({
  create: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../../src/services/ai/agents/shopAssistant.agent', () => ({ askShopAssistant: jest.fn() }));
jest.mock('../../src/services/ai/agents/orderHelper.agent', () => ({ askOrderHelper: jest.fn() }));
jest.mock('../../src/services/ai/agents/serviceHelper.agent', () => ({ askServiceHelper: jest.fn() }));
jest.mock('../../src/services/ai/agents/recipe.agent', () => ({ buildRecipeList: jest.fn() }));
jest.mock('../../src/services/ai/agents/compare.agent', () => ({ compareProducts: jest.fn() }));
// The chat works out where the shopper is once and hands that scope to every
// agent, so the request's own city, pin and block ids never reach a tool
// directly. The reads themselves are tested in tests/ai/chatCorpus.test.js.
jest.mock('../../src/services/ai/location', () => ({
  resolveShopperScope: jest.fn(),
  findAreaBlocks: jest.fn(),
}));
// The three questions the server answers from its own data, without a model.
jest.mock('../../src/services/ai/facts', () => ({
  answerLocation: jest.fn(),
  answerPolicy: jest.fn(),
  answerOffTopic: jest.fn(),
  askForDetails: jest.fn(),
  namedPlaceAsked: jest.fn(),
  namedRulePlace: jest.fn(),
}));

const User = require('../../src/models/user.model');
const AiUsage = require('../../src/models/aiUsage.model');
const { askShopAssistant } = require('../../src/services/ai/agents/shopAssistant.agent');
const { askOrderHelper } = require('../../src/services/ai/agents/orderHelper.agent');
const { askServiceHelper } = require('../../src/services/ai/agents/serviceHelper.agent');
const { buildRecipeList } = require('../../src/services/ai/agents/recipe.agent');
const { compareProducts } = require('../../src/services/ai/agents/compare.agent');
const { resolveShopperScope } = require('../../src/services/ai/location');
const {
  answerLocation,
  answerPolicy,
  answerOffTopic,
  namedPlaceAsked,
  namedRulePlace,
} = require('../../src/services/ai/facts');
const { HINTS } = require('../../src/services/ai/agents/chat.agent');
const { classifyIntent } = require('../../src/services/ai/intent');
const app = require('../../src/app');
const env = require('../../src/config/env');
const { ROLES } = require('../../src/config/roles');
const { getAuthCookie } = require('../helpers/testAuth');

const originalDailyLimit = env.ai.dailyLimit;
const cityId = new mongoose.Types.ObjectId().toString();
const blockId = new mongoose.Types.ObjectId().toString();
const customer = { _id: new mongoose.Types.ObjectId(), role: ROLES.CUSTOMER, isActive: true };

/** The scope the server resolved for this shopper, whatever the client sent. */
const SCOPE = {
  source: 'pin',
  cityId,
  lat: 31.52,
  lng: 74.35,
  blockIds: [blockId],
  blockNames: ['Gulberg III'],
  cityName: 'Lahore',
  addressLabel: 'Home',
  deliverable: true,
};

const SHOP_ANSWER = { reply: 'Rice packs nearby.', products: [{ _id: 'p1', name: 'Rice' }], degraded: false, steps: 1 };
const ORDER_ANSWER = { reply: 'It is on the way.', orders: [{ orderId: 'o1' }], degraded: false, steps: 1 };
const SERVICE_ANSWER = { reply: 'Cool Air has an evening slot.', providers: [{ providerId: 's1' }], degraded: false, steps: 1 };
const RECIPE_ANSWER = { reply: 'Found 3 ingredients.', title: 'Biryani', items: [{ ingredient: 'rice' }], products: [], degraded: false };
const COMPARE_ANSWER = { reply: 'The atta is cheaper.', products: [{ _id: 'p2' }], degraded: false, steps: 1 };

function asUser(user = customer) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

function chat(body, user = customer) {
  return request(app)
    .post('/api/v1/ai/chat')
    .set(...asUser(user))
    .send(body);
}

function expectOnly(called, others) {
  expect(called).toHaveBeenCalledTimes(1);
  for (const other of others) expect(other).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  env.ai.enabled = true;
  env.ai.dailyLimit = originalDailyLimit;
  AiUsage.countDocuments.mockResolvedValue(0);
  AiUsage.create.mockResolvedValue({});
  resolveShopperScope.mockResolvedValue(SCOPE);
  namedPlaceAsked.mockResolvedValue(null);
  namedRulePlace.mockResolvedValue(null);
  answerLocation.mockResolvedValue({ reply: 'You are in Gulberg III, Lahore.', stores: [] });
  answerPolicy.mockResolvedValue('CityCart does not add a delivery fee.');
  answerOffTopic.mockReturnValue('I only answer questions about CityCart.');
  askShopAssistant.mockResolvedValue(SHOP_ANSWER);
  askOrderHelper.mockResolvedValue(ORDER_ANSWER);
  askServiceHelper.mockResolvedValue(SERVICE_ANSWER);
  buildRecipeList.mockResolvedValue(RECIPE_ANSWER);
  compareProducts.mockResolvedValue(COMPARE_ANSWER);
});

describe('chat hints', () => {
  it('every hint reaches the mode it advertises', () => {
    for (const [mode, hints] of Object.entries(HINTS)) {
      // "help" is a greeting and "offTopic" hints are deliberately real
      // marketplace questions: they redirect the shopper instead of refusing.
      if (mode === 'help' || mode === 'offTopic') continue;
      for (const hint of hints) {
        expect({ hint, mode: classifyIntent(hint) }).toEqual({ hint, mode });
      }
    }
  });
});

describe('POST /api/v1/ai/chat', () => {
  it('routes a product question to the shopping agent only', async () => {
    const res = await chat({ message: 'cheap rice nearby', cityId });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      mode: 'shop',
      reply: 'Rice packs nearby.',
      products: SHOP_ANSWER.products,
      hints: expect.any(Array),
    });
    expect(res.body.data.hints.length).toBeGreaterThan(0);
    expectOnly(askShopAssistant, [askOrderHelper, askServiceHelper, buildRecipeList, compareProducts]);
    expect(askShopAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'cheap rice nearby', scope: SCOPE }),
    );
    expect(resolveShopperScope).toHaveBeenCalledWith(expect.objectContaining({ cityId }));
  });

  it('routes an order question to the order agent', async () => {
    const res = await chat({ message: 'where is my order?' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('order');
    expect(res.body.data.orders).toEqual(ORDER_ANSWER.orders);
    expectOnly(askOrderHelper, [askShopAssistant, askServiceHelper, buildRecipeList, compareProducts]);
  });

  it('routes a service question to the service agent with the resolved area', async () => {
    const res = await chat({ message: 'AC repair tomorrow evening', cityId, lat: 31.42, lng: 73.08 });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('service');
    expect(res.body.data.providers).toEqual(SERVICE_ANSWER.providers);
    // The pin is read once by the server and only the resolved scope is handed
    // to the agent, so a client cannot search a city it did not send.
    expect(resolveShopperScope).toHaveBeenCalledWith(expect.objectContaining({ cityId, lat: 31.42, lng: 73.08 }));
    expect(askServiceHelper).toHaveBeenCalledWith(expect.objectContaining({ scope: SCOPE }));
    expectOnly(askServiceHelper, [askShopAssistant, askOrderHelper, buildRecipeList, compareProducts]);
  });

  it.each([
    ['show me all the stores that are in my block', 'location'],
    ['what is the delivery fee?', 'policy'],
    ['who made you?', 'offTopic'],
  ])('answers %s from the server’s own data as %s', async (message, mode) => {
    const res = await chat({ message, cityId });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe(mode);
    expect(res.body.data.reply).toBeTruthy();
    expect(res.body.data.hints.length).toBeGreaterThan(0);
    for (const agent of [askShopAssistant, askOrderHelper, askServiceHelper, buildRecipeList, compareProducts]) {
      expect(agent).not.toHaveBeenCalled();
    }
  });

  it('answers a shop question that names a place with the shop list', async () => {
    // "shops in Karachi" has no city id in the request, so only the database can
    // tell the place name from a product name — and once it knows, the shopper
    // gets the shops instead of a product search for the word "karachi".
    namedPlaceAsked.mockResolvedValueOnce({ kind: 'city', name: 'Karachi', names: ['Karachi'], cityId });
    const res = await chat({ message: 'shops in karachi' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('location');
    expect(askShopAssistant).not.toHaveBeenCalled();
    expect(answerLocation).toHaveBeenCalledWith(expect.objectContaining({ text: 'shops in karachi' }));
  });

  it('answers a rule question that names a zone with that zone', async () => {
    // The router cannot know which words are zones, so it sends this to the
    // rules; the place read then moves it to the zone answer, because "tonight"
    // is not something CityCart stores and coverage is.
    namedRulePlace.mockResolvedValueOnce({
      kind: 'block',
      name: 'DHA Phase 5',
      names: ['DHA Phase 5'],
      blockIds: [blockId],
    });
    const res = await chat({ message: 'do you deliver to DHA Phase 5 tonight', cityId });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('location');
    expect(answerPolicy).not.toHaveBeenCalled();
    expect(answerLocation).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'do you deliver to DHA Phase 5 tonight' })
    );
  });

  it('refuses a block id the shopper did not pick', async () => {
    const res = await chat({ message: 'stores in my block', blockIds: ['not-an-id'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
    expect(resolveShopperScope).not.toHaveBeenCalled();
  });

  it('passes more than ten picked blocks nowhere', async () => {
    const res = await chat({ message: 'stores in my block', blockIds: Array.from({ length: 11 }, () => blockId) });

    expect(res.status).toBe(400);
    expect(resolveShopperScope).not.toHaveBeenCalled();
  });

  it('routes a dish with servings to the recipe assistant', async () => {
    const res = await chat({ message: 'Chicken biryani for 6' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mode: 'recipe', title: 'Biryani', items: RECIPE_ANSWER.items });
    expectOnly(buildRecipeList, [askShopAssistant, askOrderHelper, askServiceHelper, compareProducts]);
  });

  it('routes a comparison question to the compare agent', async () => {
    const res = await chat({ message: 'compare rice brands' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('compare');
    expect(res.body.data.products).toEqual(COMPARE_ANSWER.products);
    expectOnly(compareProducts, [askShopAssistant, askOrderHelper, askServiceHelper, buildRecipeList]);
  });

  it('answers help with capability hints and spends no provider call', async () => {
    const res = await chat({ message: 'what can you do?' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('help');
    expect(res.body.data.reply).toContain('orders');
    expect(res.body.data.hints).toEqual(
      expect.arrayContaining(['Where is my order?', 'Compare rice brands']),
    );
    expect(askShopAssistant).not.toHaveBeenCalled();
    expect(askOrderHelper).not.toHaveBeenCalled();
    expect(askServiceHelper).not.toHaveBeenCalled();
    expect(buildRecipeList).not.toHaveBeenCalled();
    expect(compareProducts).not.toHaveBeenCalled();
    expect(AiUsage.create).not.toHaveBeenCalled();
  });

  it('uses lastMode to resolve a short follow-up', async () => {
    const res = await chat({ message: 'cancel it', lastMode: 'order' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('order');
    expect(askOrderHelper).toHaveBeenCalledTimes(1);
  });

  it('ignores a client-sent mode and routes from the message itself', async () => {
    const res = await chat({ message: 'cheap rice nearby', mode: 'order' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('shop');
    expect(askOrderHelper).not.toHaveBeenCalled();
  });

  it('sanitizes markup before routing and before the agent sees it', async () => {
    const res = await chat({ message: '  <b>where is my order?</b>  ' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('order');
    expect(askOrderHelper).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'where is my order?' }),
    );
  });

  it('rejects an unknown lastMode', async () => {
    const res = await chat({ message: 'cancel it', lastMode: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
    expect(askOrderHelper).not.toHaveBeenCalled();
  });

  it.each([
    [{ message: 'a' }, 'too short'],
    [{ message: 'x'.repeat(501) }, 'too long'],
    [{ message: 'cheap rice', lat: 31.4 }, 'lat without lng'],
    [{ message: 'cheap rice', cityId: 'not-an-id' }, 'bad city'],
  ])('rejects an invalid body: %s', async (body) => {
    const res = await chat(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
    expect(askShopAssistant).not.toHaveBeenCalled();
  });

  it('refuses a non-customer before any agent runs', async () => {
    const admin = { _id: new mongoose.Types.ObjectId(), role: ROLES.BRAND_ADMIN, isActive: true };
    const res = await chat({ message: 'cheap rice' }, admin);

    expect(res.status).toBe(403);
    expect(askShopAssistant).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/v1/ai/chat').send({ message: 'cheap rice' });

    expect(res.status).toBe(401);
    expect(askShopAssistant).not.toHaveBeenCalled();
  });

  it('returns 503 and calls no agent when AI is switched off', async () => {
    env.ai.enabled = false;
    const res = await chat({ message: 'cheap rice' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(askShopAssistant).not.toHaveBeenCalled();
  });

  it('returns a typed 429 once the daily limit is spent, before any agent runs', async () => {
    env.ai.dailyLimit = 2;
    AiUsage.countDocuments.mockResolvedValue(2);
    const res = await chat({ message: 'cheap rice' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AI_DAILY_LIMIT');
    expect(askShopAssistant).not.toHaveBeenCalled();
  });
});
