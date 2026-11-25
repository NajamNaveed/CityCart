/**
 * The customer-question matrix (docs/29 Phase 2h, AGENTS.md §26–§27).
 *
 * A shopper types anything, so "the tests mirror the happy path" is not enough
 * for a chatbot: every wrong answer is one the customer acts on. This file is
 * the QA sweep over the question families the chat can actually receive — in
 * English, Urdu and Roman Urdu — and it tests the two halves of an answer
 * separately:
 *
 *   1. which mode the sentence reaches (routing), and
 *   2. what the server is allowed to say once it gets there (truth).
 *
 * The families a model can only guess at — where the shopper is, what CityCart
 * charges, anything outside the marketplace — are answered here from mocked
 * reads, so a wrong block name, invented fee or invented delivery hour fails a
 * test instead of shipping. Numbers quoted from listings are checked the same
 * way, and one shopper's saved address is proven unreachable by another.
 */
const mongoose = require('mongoose');

jest.mock('../../src/models/block.model');
jest.mock('../../src/models/city.model');
jest.mock('../../src/models/address.model');
jest.mock('../../src/services/block.service');
jest.mock('../../src/services/discover.service');
jest.mock('../../src/services/adminSettings.service', () => ({
  getPlatformSettings: jest.fn(),
}));

const Block = require('../../src/models/block.model');
const City = require('../../src/models/city.model');
const Address = require('../../src/models/address.model');
const { activeBlocksContaining } = require('../../src/services/block.service');
const { discover } = require('../../src/services/discover.service');
const { getPlatformSettings } = require('../../src/services/adminSettings.service');
const { resolveShopperScope, findAreaBlocks } = require('../../src/services/ai/location');
const {
  answerLocation,
  answerPolicy,
  namedPlace,
  namedPlaceAsked,
  namedRulePlace,
  askForDetails,
  languageOf,
} = require('../../src/services/ai/facts');
const { groundedReply, serverSentence } = require('../../src/services/ai/ground');
const { classifyIntent, INTENTS } = require('../../src/services/ai/intent');
const { fallbackQueries } = require('../../src/services/ai/query');
const { HINTS } = require('../../src/services/ai/agents/chat.agent');
const { SHOP_TOOLS } = require('../../src/services/ai/tools');

// ---------------------------------------------------------------- fixtures ---

const LAHORE = new mongoose.Types.ObjectId();
const KARACHI = new mongoose.Types.ObjectId();
const GULBERG = new mongoose.Types.ObjectId();
const DHA = new mongoose.Types.ObjectId();
const GULSHAN = new mongoose.Types.ObjectId();

const CITIES = [
  { _id: LAHORE, name: 'Lahore', isActive: true },
  { _id: KARACHI, name: 'Karachi', isActive: true },
];

const BLOCKS = [
  { _id: GULBERG, name: 'Gulberg III', cityId: LAHORE, isActive: true },
  { _id: DHA, name: 'DHA Phase 5', cityId: LAHORE, isActive: true },
  { _id: GULSHAN, name: 'Gulshan-e-Iqbal', cityId: KARACHI, isActive: true },
];

// Only these pins fall inside a published zone; anything else is outside all of
// them, which is a different answer from "no shops".
const PINS = {
  gulberg: { lat: 31.516, lng: 74.328 },
  dha: { lat: 31.518, lng: 74.345 },
  gulshan: { lat: 24.905, lng: 67.08 },
  outside: { lat: 31.9, lng: 73.2 },
};

const card = (name, km, blocks) => ({
  _id: new mongoose.Types.ObjectId().toString(),
  name,
  nearestKm: km,
  acceptingNewOrders: true,
  branches: blocks.map((blockName) => ({ blockName })),
});

const GULBERG_SHOPS = [card('Loom & Co', 0.4, ['Gulberg III']), card('Metro Fresh', 1.1, ['Gulberg III'])];
const KARACHI_SHOPS = [card('Sea View Store', 2.3, ['Gulshan-e-Iqbal'])];
const LAHORE_SHOPS = [...GULBERG_SHOPS, card('Basti Yard', 5.2, ['Model Town'])];
const SHOPS_BY_BLOCK = {
  [String(GULBERG)]: GULBERG_SHOPS,
  [String(DHA)]: [],
  [String(GULSHAN)]: KARACHI_SHOPS,
};

const OWNER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const HOME_ADDRESS = {
  label: 'Home',
  isDefault: true,
  location: { type: 'Point', coordinates: [PINS.gulberg.lng, PINS.gulberg.lat] },
};

/** A mongoose query is chainable; these code paths only ever read. */
function chain(rows, single = false) {
  const value = single ? rows[0] || null : rows;
  const query = {
    select: () => query,
    lean: () => query,
    sort: () => query,
    limit: (count) => chain(rows.slice(0, count), single),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => {
    if (condition instanceof RegExp) return condition.test(row[key]);
    if (condition && typeof condition === 'object') {
      if (condition.$in) return condition.$in.map(String).includes(String(row[key]));
      if (condition.$regex) return new RegExp(condition.$regex, condition.$options || '').test(row[key]);
      return String(row[key]) === String(condition);
    }
    return String(row[key]) === String(condition);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Block.find.mockImplementation((filter) => chain(BLOCKS.filter((block) => matches(block, filter))));
  Block.findOne.mockImplementation((filter) => chain(BLOCKS.filter((block) => matches(block, filter)), true));
  City.find.mockImplementation((filter) => chain(CITIES.filter((city) => matches(city, filter))));
  City.findOne.mockImplementation((filter) => chain(CITIES.filter((city) => matches(city, filter)), true));
  City.findById.mockImplementation((id) => chain(CITIES.filter((city) => String(city._id) === String(id)), true));
  Address.findOne.mockImplementation((filter) =>
    chain(String(filter.userId) === String(OWNER) ? [HOME_ADDRESS] : [], true)
  );
  activeBlocksContaining.mockImplementation(async (lat, lng) => {
    if (lat === PINS.gulberg.lat && lng === PINS.gulberg.lng) return [BLOCKS[0]];
    if (lat === PINS.dha.lat && lng === PINS.dha.lng) return [BLOCKS[1]];
    if (lat === PINS.gulshan.lat && lng === PINS.gulshan.lng) return [BLOCKS[2]];
    return [];
  });
  discover.mockImplementation(async ({ scope, blockIds = [], cityId }) => {
    if (scope === 'area') {
      const items = blockIds.flatMap((id) => SHOPS_BY_BLOCK[String(id)] || []);
      return { items, pagination: { total: items.length } };
    }
    const items = String(cityId) === String(KARACHI) ? KARACHI_SHOPS : LAHORE_SHOPS;
    return { items, pagination: { total: items.length } };
  });
  getPlatformSettings.mockResolvedValue({
    supportEmail: 'support@citycart.test',
    supportPhone: null,
    codMaxOrderAmount: 50000,
  });
});

const scopeAt = async (pin) =>
  resolveShopperScope({ userId: OWNER, lat: pin.lat, lng: pin.lng });

// ------------------------------------------------------------------ routing ---

const CORPUS = [
  // Shopping: an item, a budget, a vague want.
  { text: 'cheap rice', mode: INTENTS.SHOP },
  { text: 'gift under 3000', mode: INTENTS.SHOP },
  { text: 'milk nearby', mode: INTENTS.SHOP },
  { text: 'show me laptops', mode: INTENTS.SHOP },
  { text: 'biryani masala', mode: INTENTS.SHOP },
  { text: 'sasta doodh', mode: INTENTS.SHOP },
  { text: 'chawal', mode: INTENTS.SHOP },
  { text: 'kya aap ke paas brush hai', mode: INTENTS.SHOP },
  { text: 'I want to order rice online', mode: INTENTS.SHOP },
  { text: 'order rice for me', mode: INTENTS.SHOP },
  { text: 'a sandwich maker with next day delivery', mode: INTENTS.SHOP },
  { text: 'which shop sells face cream near me', mode: INTENTS.SHOP },
  // Words that belong to the rules or the kitchen but name a product here.
  { text: 'cooking oil', mode: INTENTS.SHOP },
  { text: 'baking soda', mode: INTENTS.SHOP },
  { text: 'recipe book', mode: INTENTS.SHOP },
  { text: 'address book', mode: INTENTS.SHOP },
  { text: 'timing belt for car', mode: INTENTS.SHOP },
  { text: 'deliver rice on friday', mode: INTENTS.SHOP },
  // The complaint, payment and account words that are also on the shelf.
  { text: 'order cold drinks', mode: INTENTS.SHOP },
  { text: 'broken rice 5kg', mode: INTENTS.SHOP },
  { text: 'cold drinks delivery', mode: INTENTS.SHOP },
  { text: 'colouring book for kids', mode: INTENTS.SHOP },
  { text: 'wallet for men', mode: INTENTS.SHOP },
  { text: 'welcome mat for door', mode: INTENTS.SHOP },
  { text: 'cheapest milk in my area', mode: INTENTS.SHOP },
  { text: 'rice under 3000 with free delivery', mode: INTENTS.SHOP },
  { text: 'help me find cheap rice', mode: INTENTS.SHOP },
  { text: 'بریانی کے چاول', mode: INTENTS.SHOP },

  // Their own orders.
  { text: 'where is my order?', mode: INTENTS.ORDER },
  { text: 'track my parcel', mode: INTENTS.ORDER },
  { text: 'my delivery is late', mode: INTENTS.ORDER },
  { text: 'order number 1234', mode: INTENTS.ORDER },
  { text: 'cancel it', mode: INTENTS.ORDER },
  { text: 'please cancel my order', mode: INTENTS.ORDER },
  { text: 'can I get a refund?', mode: INTENTS.ORDER },
  { text: 'mera order kahan hai', mode: INTENTS.ORDER },
  { text: 'wapsi chahiye', mode: INTENTS.ORDER },
  { text: 'customer service', mode: INTENTS.ORDER },
  { text: 'آرڈر کہاں ہے', mode: INTENTS.ORDER },
  { text: 'where is my rider', mode: INTENTS.ORDER },
  { text: 'meri delivery ka rider kahan hai', mode: INTENTS.ORDER },
  { text: 'kab tak ayega', mode: INTENTS.ORDER },
  { text: 'saman kab milega', mode: INTENTS.ORDER },
  { text: 'do you accept returns after delivery', mode: INTENTS.ORDER },
  { text: 'میرا آرڈر کد ہے', mode: INTENTS.ORDER },
  // What went wrong with the delivery — the order agent is the only one that
  // can read the parcel, and a product search for “damaged item” helps nobody.
  { text: 'wrong item delivered', mode: INTENTS.ORDER },
  { text: 'item is damaged', mode: INTENTS.ORDER },
  { text: 'my parcel came empty', mode: INTENTS.ORDER },
  { text: 'rider was rude', mode: INTENTS.ORDER },
  { text: 'no rider came', mode: INTENTS.ORDER },
  { text: 'partial delivery', mode: INTENTS.ORDER },
  { text: 'complain about rider', mode: INTENTS.ORDER },
  { text: 'saman kharab aaya hai', mode: INTENTS.ORDER },
  { text: 'meri delivery nahi aayi', mode: INTENTS.ORDER },
  { text: 'میرا سامان خراب آیا', mode: INTENTS.ORDER },
  { text: 'میری ڈیلیوری نہیں آئی', mode: INTENTS.ORDER },

  // Where the shopper is, and whether CityCart reaches a place.
  { text: 'in which block did I set my location', mode: INTENTS.LOCATION },
  { text: 'which block am I in?', mode: INTENTS.LOCATION },
  { text: 'what is my location', mode: INTENTS.LOCATION },
  { text: 'show me all the stores that are in my block', mode: INTENTS.LOCATION },
  { text: 'any stores near me', mode: INTENTS.LOCATION },
  { text: 'do you deliver to my area', mode: INTENTS.LOCATION },
  { text: 'is delivery available in my area', mode: INTENTS.LOCATION },
  { text: 'do you deliver to DHA Phase 5', mode: INTENTS.LOCATION },
  { text: 'which areas do you cover', mode: INTENTS.LOCATION },
  { text: 'kahan hai mera address', mode: INTENTS.LOCATION },
  { text: 'mera ilaka kya hai', mode: INTENTS.LOCATION },
  { text: 'کیا آپ میرے علاقے میں ڈیلیوری کرتے ہیں', mode: INTENTS.LOCATION },
  { text: 'which store is closest to me', mode: INTENTS.LOCATION },
  { text: 'how many shops are in my block?', mode: INTENTS.LOCATION },
  { text: 'mera ilaka kaunsa hai', mode: INTENTS.LOCATION },
  { text: 'kya aap DHA mein deliver karte hain', mode: INTENTS.LOCATION },
  { text: 'do you reach Gulberg', mode: INTENTS.LOCATION },

  // How the marketplace works, including money.
  { text: 'what is the delivery fee?', mode: INTENTS.POLICY },
  { text: 'is delivery free', mode: INTENTS.POLICY },
  { text: 'how much is delivery', mode: INTENTS.POLICY },
  { text: 'charge for delivery', mode: INTENTS.POLICY },
  { text: 'delivery kitni hai', mode: INTENTS.POLICY },
  { text: 'how do I pay?', mode: INTENTS.POLICY },
  { text: 'can I pay with a card', mode: INTENTS.POLICY },
  { text: 'cash on delivery?', mode: INTENTS.POLICY },
  { text: 'what is the minimum order', mode: INTENTS.POLICY },
  { text: 'till what time are shops open?', mode: INTENTS.POLICY },
  { text: 'what is the delivery time', mode: INTENTS.POLICY },
  { text: 'how long does delivery take', mode: INTENTS.POLICY },
  { text: 'how do I order', mode: INTENTS.POLICY },
  { text: 'دکان کب کھلتی ہے', mode: INTENTS.POLICY },
  { text: 'طریقہ ادائیگی کیا ہے', mode: INTENTS.POLICY },
  { text: 'are shops open now?', mode: INTENTS.POLICY },
  { text: 'minimum order for delivery', mode: INTENTS.POLICY },
  { text: 'how do I get free delivery', mode: INTENTS.POLICY },
  { text: 'do you deliver in the evening', mode: INTENTS.POLICY },
  { text: 'do you have delivery today', mode: INTENTS.POLICY },
  { text: 'what time does the shop close', mode: INTENTS.POLICY },
  { text: 'i want to speak to a human', mode: INTENTS.POLICY },
  { text: 'do you deliver tonight', mode: INTENTS.POLICY },
  // Routed as a rule, answered as a place: the zone is read from the database
  // before the sentence is written, so the shopper learns about DHA Phase 5.
  { text: 'do you deliver to DHA Phase 5 tonight', mode: INTENTS.POLICY },
  { text: 'do you deliver in dha phase 5 at 9pm', mode: INTENTS.POLICY },
  { text: 'what are your timings', mode: INTENTS.POLICY },
  { text: 'are you open 24 hours', mode: INTENTS.POLICY },
  { text: 'do you work on eid', mode: INTENTS.POLICY },
  { text: 'apne kab tak khule rehte ho', mode: INTENTS.POLICY },
  { text: 'where is my cart', mode: INTENTS.POLICY },
  { text: 'how do I change my saved address', mode: INTENTS.POLICY },
  { text: 'do i need an account to order', mode: INTENTS.POLICY },
  { text: 'kaise payment karu', mode: INTENTS.POLICY },
  { text: 'do you have installment', mode: INTENTS.POLICY },
  { text: 'my coupon is not working', mode: INTENTS.POLICY },
  // Methods that exist only as words, the paper an order leaves behind, the
  // number nobody may hand out, and working on the platform instead of buying.
  { text: 'can I pay with easypaisa', mode: INTENTS.POLICY },
  { text: 'do you accept cash', mode: INTENTS.POLICY },
  { text: 'jazzcash', mode: INTENTS.POLICY },
  { text: 'bank transfer', mode: INTENTS.POLICY },
  { text: 'can I get an invoice', mode: INTENTS.POLICY },
  { text: 'do you give receipt', mode: INTENTS.POLICY },
  { text: 'bill chahiye', mode: INTENTS.POLICY },
  { text: 'forgot password', mode: INTENTS.POLICY },
  { text: 'how do I change my password', mode: INTENTS.POLICY },
  { text: 'rider ka number', mode: INTENTS.POLICY },
  { text: 'give me the riders number', mode: INTENTS.POLICY },
  { text: 'shop ka phone number', mode: INTENTS.POLICY },
  { text: 'call the rider', mode: INTENTS.POLICY },
  { text: 'how do I sell my products', mode: INTENTS.POLICY },
  { text: 'i want to open a shop', mode: INTENTS.POLICY },
  { text: 'how to become a rider', mode: INTENTS.POLICY },
  { text: 'seller apply', mode: INTENTS.POLICY },
  { text: 'place an order for me', mode: INTENTS.POLICY },
  { text: 'why is the total more than the price', mode: INTENTS.POLICY },
  { text: 'دکان کا فون نمبر', mode: INTENTS.POLICY },
  { text: 'مجھے بل چاہیے', mode: INTENTS.POLICY },
  { text: 'کیا آپ جمعرات کو ڈیلیوری کرتے ہیں', mode: INTENTS.POLICY },
  { text: 'میرا پتہ کیسے بدلیں', mode: INTENTS.POLICY },

  // Comparison, recipes, services, help.
  { text: 'compare rice brands', mode: INTENTS.COMPARE },
  { text: 'rice vs atta', mode: INTENTS.COMPARE },
  { text: 'difference between the two oils', mode: INTENTS.COMPARE },
  { text: 'موازنہ کریں', mode: INTENTS.COMPARE },
  { text: 'recipe for biryani', mode: INTENTS.RECIPE },
  { text: 'Chicken biryani for 6', mode: INTENTS.RECIPE },
  { text: 'biryani kaise banaye', mode: INTENTS.RECIPE },
  { text: 'بریانی کی ترکیب', mode: INTENTS.RECIPE },
  { text: 'plumber near me', mode: INTENTS.SERVICE },
  { text: 'plumber in my area', mode: INTENTS.SERVICE },
  { text: 'AC repair tomorrow evening', mode: INTENTS.SERVICE },
  { text: 'my tap is leaking', mode: INTENTS.SERVICE },
  { text: 'book an appointment', mode: INTENTS.SERVICE },
  { text: 'book a plumber', mode: INTENTS.SERVICE },
  { text: 'booking ka status', mode: INTENTS.SERVICE },
  { text: 'cancel my booking', mode: INTENTS.SERVICE },
  { text: 'reschedule my appointment', mode: INTENTS.SERVICE },
  { text: 'بجلی کا کام', mode: INTENTS.SERVICE },
  { text: 'help', mode: INTENTS.HELP },
  { text: 'what can you do', mode: INTENTS.HELP },
  { text: 'مدد', mode: INTENTS.HELP },

  // Nothing to do with the marketplace.
  { text: 'who made you', mode: INTENTS.OFF_TOPIC },
  { text: 'are you a real person', mode: INTENTS.OFF_TOPIC },
  { text: 'what is your name', mode: INTENTS.OFF_TOPIC },
  { text: 'tell me a joke', mode: INTENTS.OFF_TOPIC },
  { text: 'weather in lahore', mode: INTENTS.OFF_TOPIC },
  { text: 'write my homework', mode: INTENTS.OFF_TOPIC },
  { text: 'cricket score', mode: INTENTS.OFF_TOPIC },
  { text: 'میرے لیے نوکری دیکھو', mode: INTENTS.OFF_TOPIC },
  { text: 'what is 2 plus 2', mode: INTENTS.OFF_TOPIC },
  { text: 'give me my password', mode: INTENTS.OFF_TOPIC },
  { text: 'where is the nearest ATM', mode: INTENTS.OFF_TOPIC },

  // The same words with a product attached stay a product search: a shopper
  // asking for rice in a named block wants rice, not a zone description.
  { text: 'rice in dha phase 5', mode: INTENTS.SHOP },
  { text: 'cheapest milk in my area', mode: INTENTS.SHOP },
  { text: 'milk', mode: INTENTS.SHOP },
  { text: 'sasta doodh do', mode: INTENTS.SHOP },
  { text: 'is there any shop near me', mode: INTENTS.LOCATION },
  { text: 'which shops are open now', mode: INTENTS.POLICY },
];

describe('chat routing corpus', () => {
  it.each(CORPUS)('routes “$text” to $mode', ({ text, mode }) => {
    expect(classifyIntent(text)).toBe(mode);
  });

  it('has no dead cases in the matrix', () => {
    const modes = new Set(CORPUS.map((row) => row.mode));
    expect([...modes].sort()).toEqual(Object.values(INTENTS).sort());
  });

  describe('follow-ups keep the thread they were asked in', () => {
    it('stays on the shopper’s own area', () => {
      expect(classifyIntent('then show me the shops', { lastMode: INTENTS.LOCATION })).toBe(INTENTS.LOCATION);
      expect(classifyIntent('what about there', { lastMode: INTENTS.LOCATION })).toBe(INTENTS.LOCATION);
    });

    it('switches when the new sentence says something else', () => {
      expect(classifyIntent('what is the delivery fee', { lastMode: INTENTS.LOCATION })).toBe(INTENTS.POLICY);
      expect(classifyIntent('cheap rice', { lastMode: INTENTS.LOCATION })).toBe(INTENTS.SHOP);
      expect(classifyIntent('my order status', { lastMode: INTENTS.LOCATION })).toBe(INTENTS.ORDER);
    });

    it('routes every hint the chat offers, so a tap always lands where it says', () => {
      for (const [mode, hints] of Object.entries(HINTS)) {
        // "help" is a greeting, not a question, and off-topic hints are real
        // marketplace questions on purpose: they pull the shopper back to
        // something the assistant can answer instead of refusing.
        if (mode === INTENTS.HELP || mode === INTENTS.OFF_TOPIC) continue;
        for (const hint of hints) expect({ hint, mode: classifyIntent(hint) }).toEqual({ hint, mode });
      }
    });
  });
});

// ------------------------------------------------------------- the language ---

describe('language of the reply', () => {
  it.each([
    ['cheap rice nearby', 'en'],
    ['sasta doodh do', 'roman'],
    ['میری دیکھو', 'ur'],
  ])('%s → %s', (text, language) => {
    expect(languageOf(text)).toBe(language);
  });
});

// --------------------------------------------------------------- the shopper's ---
// ------------------------------------------------------------------ own place

describe('resolving where the shopper is', () => {
  it('uses a pin dropped in this request', async () => {
    const scope = await scopeAt(PINS.gulberg);
    expect(scope).toMatchObject({ source: 'pin', blockNames: ['Gulberg III'], cityName: 'Lahore', deliverable: true });
  });

  it('falls back to the shopper’s own saved address when there is no pin', async () => {
    const scope = await resolveShopperScope({ userId: OWNER });
    expect(scope).toMatchObject({ source: 'address', addressLabel: 'Home', blockNames: ['Gulberg III'] });
  });

  it('never reads another customer’s address', async () => {
    await resolveShopperScope({ userId: OTHER });
    expect(Address.findOne.mock.calls[0][0]).toEqual({ userId: String(OTHER) });

    const stranger = await resolveShopperScope({ userId: OTHER });
    expect(stranger.blockNames).toEqual([]);
    expect(stranger.source).toBe('none');
  });

  it('re-reads a client-sent block id instead of trusting it', async () => {
    const fake = new mongoose.Types.ObjectId();
    const scope = await resolveShopperScope({ userId: OTHER, blockIds: [String(fake)] });
    expect(scope.source).toBe('none');
    expect(scope.blockIds).toEqual([]);

    const real = await resolveShopperScope({ userId: OTHER, blockIds: [String(GULSHAN)] });
    expect(real).toMatchObject({ source: 'selected', blockNames: ['Gulshan-e-Iqbal'], cityName: 'Karachi' });
  });

  it('refuses a hand-made block list that spans two cities', async () => {
    const scope = await resolveShopperScope({ userId: OTHER, blockIds: [String(GULBERG), String(GULSHAN)] });
    expect(scope.source).toBe('none');
    expect(scope.blockIds).toEqual([]);
  });

  it('says plainly when a position falls in no zone', async () => {
    const scope = await scopeAt(PINS.outside);
    expect(scope.deliverable).toBe(false);
    const { reply, stores } = await answerLocation({ text: 'do you deliver to my area', scope });
    expect(reply).toMatch(/not inside a CityCart delivery zone/i);
    expect(stores).toEqual([]);
  });

  it('tells the shopper to set a location when nothing is known', async () => {
    const scope = await resolveShopperScope({ userId: OTHER });
    const { reply } = await answerLocation({ text: 'which block am I in?', scope });
    expect(reply).toMatch(/have not set a location/i);
    expect(reply).toMatch(/Nearby page/i);
  });
});

// ------------------------------------------------------- shops in the block ---

describe('answering “what is near me” with real listings', () => {
  it('names the block and the shops that are actually in it', async () => {
    const scope = await scopeAt(PINS.gulberg);
    const { reply, stores } = await answerLocation({ text: 'show me all the stores in my block', scope });
    expect(reply).toMatch(/Gulberg III/);
    expect(reply).toMatch(/2 shops are in/i);
    expect(stores.map((store) => store.name)).toEqual(['Loom & Co', 'Metro Fresh']);
    expect(stores[0].blocks).toEqual(['Gulberg III']);
  });

  it('counts from the total and points at the rest, not at the page', async () => {
    const many = [card('A', 0.2, ['Gulberg III']), card('B', 0.5, ['Gulberg III']), card('C', 0.9, ['Gulberg III']), card('D', 1.4, ['Gulberg III'])];
    discover.mockResolvedValue({ items: many, pagination: { total: 21 } });
    const scope = await scopeAt(PINS.gulberg);
    const { reply, stores } = await answerLocation({ text: 'stores in my block', scope });
    expect(stores).toHaveLength(3);
    expect(reply).toMatch(/21 shops are in/);
    expect(reply).toMatch(/More are on the Nearby page/);
  });

  it('searches the block first, so the answer is measured from the shopper', async () => {
    const scope = await scopeAt(PINS.gulberg);
    await answerLocation({ text: 'shops in my block', scope });
    expect(discover.mock.calls[0][0]).toMatchObject({ scope: 'area', blockIds: [String(GULBERG)] });
  });

  it('says no shop is there when the block has none, and never calls the rest nearby', async () => {
    const scope = await scopeAt(PINS.dha);
    const { reply, stores } = await answerLocation({ text: 'stores in my block', scope });
    expect(reply).toMatch(/No CityCart shop is in DHA Phase 5 yet/);
    expect(reply).not.toMatch(/near you|nearby/i);
    expect(reply).toMatch(/outside your block/);
    expect(stores.every((store) => !store.blocks.includes('DHA Phase 5'))).toBe(true);
  });

  it('answers a question about the location alone with no shop cards', async () => {
    const scope = await scopeAt(PINS.gulberg);
    const { reply, stores } = await answerLocation({ text: 'which block did I set my location', scope });
    expect(reply).toMatch(/location is set to Gulberg III, Lahore/);
    expect(stores).toEqual([]);
  });
});

// -------------------------------------------------- a place the shopper names ---

describe('answering a place named in the message', () => {
  it('finds a zone in the shopper’s own city', async () => {
    const scope = await scopeAt(PINS.gulberg);
    const place = await namedPlace('do you deliver to DHA Phase 5', scope.cityId);
    expect(place).toMatchObject({ kind: 'block', blockIds: [String(DHA)] });
  });

  it('looks beyond the shopper’s city for a block they named', async () => {
    const scope = await scopeAt(PINS.gulberg);
    const place = await namedPlace('do you deliver to gulshan', scope.cityId);
    expect(place).toMatchObject({ kind: 'block', cityName: 'Karachi', blockIds: [String(GULSHAN)] });
  });

  it('answers for a whole city CityCart operates in', async () => {
    const scope = await scopeAt(PINS.gulberg);
    const { reply, stores } = await answerLocation({ text: 'do you deliver to Karachi', scope });
    expect(reply).toMatch(/CityCart operates in Karachi/);
    expect(stores.map((store) => store.name)).toEqual(['Sea View Store']);
    expect(discover.mock.calls.some(([{ scope: s }]) => s === 'city')).toBe(true);
  });

  it('does not invent a zone the platform has never published', async () => {
    const scope = await scopeAt(PINS.gulberg);
    const { reply, stores } = await answerLocation({ text: 'do you deliver to brown line bazaar', scope });
    expect(reply).toMatch(/no delivery zone called “Brown line bazaar”/i);
    expect(reply).toMatch(/Gulberg III/);
    expect(stores).toEqual([]);
  });

  it('says a published zone has no shop yet', async () => {
    const scope = await scopeAt(PINS.gulshan);
    discover.mockResolvedValue({ items: [], pagination: { total: 0 } });
    const { reply, stores } = await answerLocation({ text: 'shops in DHA Phase 5', scope });
    expect(reply).toMatch(/DHA Phase 5/);
    expect(reply).toMatch(/no shop has opened there yet/i);
    expect(stores).toEqual([]);
  });

  it('answers about a place only when the shopper asked about shops', async () => {
    const scope = await scopeAt(PINS.gulberg);
    expect(await namedPlaceAsked('shops in karachi', scope.cityId)).toMatchObject({ kind: 'city', name: 'Karachi' });
    expect(await namedPlaceAsked('stores in DHA Phase 5', scope.cityId)).toMatchObject({ kind: 'block' });
    // No shop word in it: they asked for an item that merely names a city, and
    // a product search is the right answer.
    expect(await namedPlaceAsked('cheap rice in Karachi', scope.cityId)).toBeNull();
    // An unknown zone still gets the honest sentence rather than items whose
    // names happen to match the words.
    expect(await namedPlaceAsked('shops in brown line bazaar', scope.cityId)).toMatchObject({ kind: 'unknown' });
  });

  it('ignores “my area” as a place name', async () => {
    const scope = await scopeAt(PINS.gulberg);
    expect(await namedPlace('do you deliver to my area', scope.cityId)).toBeNull();
  });

  it('lets a zone answer a coverage question but not a money question', async () => {
    const scope = await scopeAt(PINS.gulberg);
    // The shopper named a real zone, so the answer is about that zone.
    expect(await namedRulePlace('do you deliver to DHA Phase 5 tonight', scope.cityId)).toMatchObject({
      kind: 'block',
      name: 'DHA Phase 5',
    });
    // The same zone named inside a pricing question is not the subject; the fee
    // is one rule for the whole platform.
    expect(await namedRulePlace('what is the delivery fee in DHA Phase 5', scope.cityId)).toBeNull();
    expect(await namedRulePlace('can I pay with a card in DHA Phase 5', scope.cityId)).toBeNull();
    // "evening" is a time, not a zone: a name the database has no block for
    // must not turn the schedule sentence into a missing-zone sentence.
    expect(await namedRulePlace('do you deliver in the evening', scope.cityId)).toBeNull();
  });
});

// ---------------------------------------------------------------- the rules ---

describe('answering CityCart’s own rules', () => {
  it.each([
    ['what is the delivery fee', /does not add a delivery fee/i],
    ['is delivery free', /does not add a delivery fee/i],
    ['how do I pay', /cash to the rider/i],
    ['can I pay with a card', /only payment method/i],
    ['what is the minimum order', /no minimum order/i],
    ['till what time are shops open', /does not store a shop’s opening hours/i],
    ['what are your timings', /does not store a shop’s opening hours/i],
    ['are you open 24 hours', /does not store a shop’s opening hours/i],
    ['do you deliver on friday', /does not store a shop’s opening hours/i],
    ['what time does the shop close', /does not store a shop’s opening hours/i],
    ['do you deliver in the evening', /does not store a shop’s opening hours/i],
    ['do you deliver tonight', /does not store a shop’s opening hours/i],
    ['what is the delivery time', /does not publish a delivery time/i],
    ['how do I order', /Nearby page/i],
    ['where is my cart', /Cart page/i],
    ['how do I change my saved address', /Addresses page/i],
    ['do you have installment', /only payment method/i],
    ['kaise payment karu', /rider ko cash/i],
    ['my coupon is not working', /not find that in CityCart’s own rules/i],
    ['can I pay with easypaisa', /only payment method/i],
    ['do you accept cash', /only payment method/i],
    ['bank transfer', /only payment method/i],
    ['can I get an invoice', /receipt/i],
    ['bill chahiye', /receipt/i],
    ['forgot password', /Forgot password/i],
    ['how do I change my password', /Forgot password/i],
    ['rider ka number', /rider ka number nahi de sakta/i],
    ['shop ka phone number', /shop ke page par/i],
    ['how do I sell my products', /Sell page/i],
    ['how to become a rider', /rider account is created/i],
    ['why is the total more than the price', /server adds the checkout total/i],
    ['how do I contact support', /support@citycart\.test/],
    ['i want to speak to a human', /support@citycart\.test/],
    ['do you deliver on mars', /not find that in CityCart’s own rules/i],
    ['کیا آپ جمعرات کو ڈیلیوری کرتے ہیں', /اوقات/],
    ['میرا پتہ کیسے بدلیں', /اکاؤنٹ/],
    ['دکان کا فون نمبر', /دکان کے صفحے/],
    ['رائیڈر کا نمبر', /نمبر نہیں دے سکتا/],
  ])('%s → %s', async (question, expected) => {
    const reply = await answerPolicy({ text: question });
    expect(reply).toMatch(expected);
  });

  it('states no amount it did not read from settings', async () => {
    const replies = await Promise.all(
      [
        'what is the delivery fee',
        'is there a minimum order',
        'how do I pay',
        'delivery kitni hai',
        'what is the delivery time',
      ].map((text) => answerPolicy({ text }))
    );
    for (const reply of replies) {
      expect(reply).not.toMatch(/Rs\s?\d|PKR\s?\d|\d+\s?%|free of charge|₨\s?\d/);
    }
  });

  it('quotes a support channel only when the platform has one', async () => {
    getPlatformSettings.mockResolvedValue({ supportEmail: null, supportPhone: '0300-0000000' });
    expect(await answerPolicy({ text: 'support number' })).toContain('0300-0000000');

    getPlatformSettings.mockResolvedValue({ supportEmail: null, supportPhone: null });
    expect(await answerPolicy({ text: 'support number' })).toMatch(/not find that in CityCart’s own rules/i);
  });

  it('answers in the language the rule was asked about', async () => {
    expect(await answerPolicy({ text: 'ڈیلیوری فیس کتنی ہے' })).toMatch(/ڈیلیوری فیس/);
    expect(await answerPolicy({ text: 'delivery kitni hai' })).toMatch(/delivery fee add nahi karta/);
  });
});

// ------------------------------------------------------ numbers the shopper ---
// ----------------------------------------------------------------- can act on

describe('grounding the sentence around the cards', () => {
  const rice = { _id: 'p1', name: 'Basmati Rice 5kg', price: 1450, brandName: 'Loom & Co' };
  const evidence = [{ tool: 'search_products', result: { items: [{ name: rice.name, price: 1450, km: 0.4 }] } }];

  it('keeps a sentence whose numbers the tools said', () => {
    const { reply, corrected } = groundedReply({
      answer: 'Basmati Rice 5kg is Rs 1450, 0.4 km away.',
      evidence,
      mode: 'shop',
      cards: [rice],
      scope: { blockNames: ['Gulberg III'], cityName: 'Lahore' },
    });
    expect(corrected).toBe(false);
    expect(reply).toBe('Basmati Rice 5kg is Rs 1450, 0.4 km away.');
  });

  it('replaces the sentence when it invents a price', () => {
    const { reply, corrected } = groundedReply({
      answer: 'Basmati Rice is only Rs 999 today — half price!',
      evidence,
      mode: 'shop',
      cards: [rice],
      scope: { blockNames: ['Gulberg III'], cityName: 'Lahore' },
    });
    expect(corrected).toBe(true);
    expect(reply).not.toMatch(/999|half price/);
    expect(reply).toContain('Rs 1450');
    expect(reply).toContain('in Gulberg III');
  });

  it('replaces an invented rating and distance too', () => {
    for (const answer of ['Rated 4.8 stars by everyone.', 'It is barely 1 km from you.']) {
      const { corrected } = groundedReply({
        answer,
        evidence,
        mode: 'shop',
        cards: [rice],
        scope: { blockNames: ['Gulberg III'] },
      });
      expect(corrected).toBe(true);
    }
  });

  it('never lets digits inside an id count as evidence', () => {
    const idOnly = [{ tool: 'search_products', result: { items: [{ _id: '145014501450145014501450', name: 'Rice' }] } }];
    const { reply, corrected } = groundedReply({
      answer: 'Rice is Rs 1450.',
      evidence: idOnly,
      mode: 'shop',
      cards: [{ _id: '145014501450145014501450', name: 'Rice' }],
      scope: {},
    });
    expect(corrected).toBe(true);
    expect(reply).not.toContain('1450');
  });

  it('does not claim “near you” when no location was resolved', () => {
    expect(serverSentence('shop', [rice], {})).not.toMatch(/near you|nearby/i);
    expect(serverSentence('shop', [rice], { cityName: 'Lahore' })).toContain('in Lahore');
  });

  it('carries the block warning into the sentence it writes', () => {
    const { reply } = groundedReply({
      answer: 'You will love these nearby shops!',
      evidence,
      mode: 'shop',
      cards: [rice],
      scope: { blockNames: ['DHA Phase 5'] },
      note: 'Nothing was found in DHA Phase 5. These listings are from elsewhere in the city, not from your block.',
    });
    expect(reply).toMatch(/not from your block/);
  });

  it('says there is nothing when a search came back empty', () => {
    expect(serverSentence('shop', [], { blockNames: ['Gulberg III'] })).toMatch(/did not find a listing in Gulberg III/);
    expect(serverSentence('order', [], {})).toMatch(/could not find that in your orders/i);
  });
});

// ------------------------------------------------------------ asking instead ---
// --------------------------------------------------------------- of searching

describe('a message with nothing to search', () => {
  it('asks for the item instead of guessing', () => {
    expect(askForDetails('something')).toMatch(/Tell me the item you want/);
    expect(askForDetails('مجھے کچھ چاہیے')).toMatch(/سامان کا نام بتائیں/);
    expect(askForDetails('mujhe kuch chahiye')).toMatch(/item ka naam batayein/);
  });

  it('answers a thank you as a thank you', () => {
    // These words are searchable tokens by shape alone, so they used to reach
    // the shop agent, which looked for a product called “thanks”.
    for (const text of ['thanks', 'thank you', 'shukriya', 'khuda hafiz', 'bye', 'شکریہ', 'الوداع']) {
      expect(fallbackQueries(text)).toEqual([]);
      expect(classifyIntent(text)).toBe(INTENTS.SHOP);
    }
    expect(askForDetails('thanks')).toMatch(/You are welcome/);
    expect(askForDetails('شکریہ')).toMatch(/شکریہ/);
    expect(askForDetails('shukriya')).toMatch(/shukriya/i);
  });
});

// --------------------------------------------------------- nothing may write ---

describe('the shopper agents stay read-only', () => {
  it('offers no tool that changes anything', () => {
    expect(SHOP_TOOLS.map((tool) => tool.name)).toEqual([
      'search_products',
      'list_categories',
      'find_stores',
      'my_location',
      'check_area',
    ]);
  });

  it('has no arguments the model could stuff an id into', () => {
    for (const tool of SHOP_TOOLS) {
      expect(tool.argsSchema.safeParse({ brandId: 'deadbeefdeadbeefdeadbeef', customerId: OWNER.toString() }).success).toBe(
        false
      );
    }
  });
});
