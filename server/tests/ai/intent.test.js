const { classifyIntent, INTENTS } = require('../../src/services/ai/intent');

describe('classifyIntent', () => {
  describe('shopping (default)', () => {
    it.each([
      'cheap rice',
      'gift under 3000',
      'milk nearby',
      'biryani masala',
      'chicken biryani',
      'show me laptops',
      'best rice',
      'I want to order rice online',
      'sasta doodh',
    ])('%s', (text) => {
      expect(classifyIntent(text)).toBe(INTENTS.SHOP);
    });
  });

  describe('orders', () => {
    it.each([
      'where is my order?',
      'Where is my latest order?',
      'my order status',
      'track my parcel',
      'How do returns work?',
      'Can I get a refund?',
      'Cancel my order',
      'mera order kahan hai',
      'meri order kab ayegi',
      'order number 1234',
      'my delivery is late',
      'wapsi chahiye',
      'I want to return this shirt',
      'customer service',
      'آرڈر کہاں ہے',
    ])('%s', (text) => {
      expect(classifyIntent(text)).toBe(INTENTS.ORDER);
    });

    it('does not treat a plain purchase verb as an order question', () => {
      expect(classifyIntent('order rice for me')).toBe(INTENTS.SHOP);
      expect(classifyIntent('I want to order a pizza')).toBe(INTENTS.SHOP);
    });
  });

  describe('comparison', () => {
    it.each([
      'Compare rice brands',
      'compare two milk cartons',
      'rice vs atta',
      'which is cheaper, milk or tea?',
      'difference between the two oils',
      'side by side rice packs',
      'موازنہ کریں',
    ])('%s', (text) => {
      expect(classifyIntent(text)).toBe(INTENTS.COMPARE);
    });
  });

  describe('recipes', () => {
    it.each([
      'recipe for biryani',
      'Chicken biryani for 6',
      'Aloo gosht for 4',
      'Vegetable pulao for 4',
      'ingredients for aloo gosht',
      'biryani kaise banaye',
      'بریانی کی ترکیب',
    ])('%s', (text) => {
      expect(classifyIntent(text)).toBe(INTENTS.RECIPE);
    });
  });

  describe('services', () => {
    it.each([
      'AC repair tomorrow evening',
      'plumber near me',
      'Salon for a haircut',
      'book an appointment',
      'my tap is leaking',
      'need a mistri for my roof',
      'بجلی کا کام',
    ])('%s', (text) => {
      expect(classifyIntent(text)).toBe(INTENTS.SERVICE);
    });
  });

  describe('help', () => {
    it.each(['help', 'Help!', 'hello', 'salam', 'what can you do', 'madad', 'مدد'])(
      '%s',
      (text) => {
        expect(classifyIntent(text)).toBe(INTENTS.HELP);
      },
    );

    it('keeps a real request that merely starts with help', () => {
      expect(classifyIntent('help me find cheap rice')).toBe(INTENTS.SHOP);
    });
  });

  describe('follow-ups use the previous mode only when the sentence has no signal', () => {
    it('keeps an order thread', () => {
      expect(classifyIntent('cancel it', { lastMode: 'order' })).toBe(INTENTS.ORDER);
      expect(classifyIntent('when will it arrive?', { lastMode: 'order' })).toBe(INTENTS.ORDER);
    });

    it('keeps a service thread', () => {
      expect(classifyIntent('tomorrow evening', { lastMode: 'service' })).toBe(INTENTS.SERVICE);
      expect(classifyIntent('any slot after 5?', { lastMode: 'service' })).toBe(INTENTS.SERVICE);
    });

    it('keeps comparison and shopping follow-ups', () => {
      expect(classifyIntent('which is cheaper?', { lastMode: 'compare' })).toBe(INTENTS.COMPARE);
      expect(classifyIntent('any cheaper ones?', { lastMode: 'shop' })).toBe(INTENTS.SHOP);
    });

    it('lets a strong new request switch threads', () => {
      expect(classifyIntent('show me cheap rice', { lastMode: 'order' })).toBe(INTENTS.SHOP);
      expect(classifyIntent('compare rice brands', { lastMode: 'order' })).toBe(INTENTS.COMPARE);
      expect(classifyIntent('my order status', { lastMode: 'service' })).toBe(INTENTS.ORDER);
    });

    it('ignores an unknown previous mode', () => {
      expect(classifyIntent('cancel it', { lastMode: 'nonsense' })).toBe(INTENTS.SHOP);
    });
  });

  it('orders win over comparison when both words appear', () => {
    expect(classifyIntent('compare my refund')).toBe(INTENTS.ORDER);
  });

  it('trims and ignores markup before routing', () => {
    expect(classifyIntent('  <b>where is my order?</b>  ')).toBe(INTENTS.ORDER);
  });
});
