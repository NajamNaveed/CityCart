/**
 * The last check on a drafted shop reply (docs/29 Phase 2i, AGENTS.md §26–§27).
 *
 * A draft is the one AI text in this product that becomes a promise: the shop
 * reads it, presses "use", and a customer holds the shop to it. So this suite
 * does not test that the wording is nice — it tests what the drafter is
 * forbidden to hand over. Three things must refuse a draft in all three
 * languages, and each must be replaced by a line the server wrote from records
 * it actually read:
 *
 *   1. a money-or-parcel action the platform cannot verify;
 *   2. a figure the records do not contain, including a stock count, which
 *      CityCart publishes to the shop alone;
 *   3. money the platform does not charge at all — a delivery fee, a minimum
 *      order, a coupon.
 *
 * And the replacement lines are tested too, because a safe refusal that states
 * a wrong price is no refusal at all.
 */
const {
  checkDraft,
  serverDraft,
  makesActionClaim,
  promisesUnenforcedMoney,
  DECLINED_LINES,
  ACKNOWLEDGE_LINES,
  STOCK_LINES,
} = require('../../src/services/ai/draftGuard');

const rice = { productName: 'Basmati Rice 5kg', price: 1600, compareAtPrice: 1900 };

describe('checkDraft — a promise the platform cannot verify', () => {
  it.each([
    ['English', 'We will refund your money today.'],
    ['English', 'The replacement has already been sent.'],
    ['English', 'We are cancelling the order for you.'],
    ['English', 'We will send you a new bag free of cost.'],
    ['English', 'Your money back is on its way.'],
    ['Roman Urdu', 'Hum aap ke paise wapas kar denge.'],
    ['Roman Urdu', 'Refund ho jayega kal.'],
    ['Roman Urdu', 'Hum dubara bhej denge.'],
    ['Roman Urdu', 'Shop ne aap ka order cancel kar diya.'],
    ['Urdu script', 'آپ کے پیسے واپس کر دیں گے۔'],
    ['Urdu script', 'ہم سامان دوبارہ بھیج دیں گے۔'],
    ['Urdu script', 'ری فنڈ کر دیا گیا ہے۔'],
  ])('refuses an action claim in %s', (_label, draft) => {
    expect(checkDraft({ draft, facts: rice }).reasons).toContain('action');
    expect(makesActionClaim(draft)).toBe(true);
  });

  it('keeps the customer’s own order state, which is a record and not a promise', () => {
    const facts = { orderState: 'OUT_FOR_DELIVERY', itemCount: 3 };
    expect(checkDraft({ draft: 'Your order is on its way with a rider (3 items).', facts }).ok).toBe(true);
    expect(checkDraft({ draft: 'Your order was cancelled by the shop.', facts: { orderState: 'CANCELLED' } }).ok).toBe(
      true
    );
  });

  it.each([
    ['English', 'Delivery is free on this order.'],
    ['English', 'The delivery charge is Rs 200.'],
    ['English', 'There is a minimum order of Rs 500.'],
    ['English', 'Use coupon code RICE10 for a discount.'],
    ['English', 'Apply this promo code at checkout.'],
    ['Roman Urdu', 'Is order ki delivery fee 200 hai.'],
    ['Roman Urdu', 'Coupon code use karein.'],
    ['Urdu script', 'ڈیلیوری چارج 200 روپے ہے۔'],
    ['Urdu script', 'مفت ڈیلیوری آج۔'],
  ])('refuses money CityCart does not charge: %s', (_label, draft) => {
    expect(checkDraft({ draft, facts: rice }).reasons).toContain('money');
    expect(promisesUnenforcedMoney(draft)).toBe(true);
  });
});

describe('checkDraft — a figure the records never said', () => {
  it('refuses a stock count, which is not public to a customer', () => {
    const facts = { productName: 'Basmati Rice 5kg', stockState: 'LOW_STOCK' };
    for (const draft of [
      'We have 12 pieces left in stock.',
      'Only 3 boxes remain.',
      'Basmati Rice 5kg — 7 pcs left, order soon.',
      'Humare paas 12 bacche hain.',
      'اس کے 9 عدد بچے ہیں۔',
    ]) {
      const verdict = checkDraft({ draft, facts });
      expect(verdict.ok).toBe(false);
      expect(verdict.reasons).toContain('numbers');
      expect(verdict.missing.length).toBeGreaterThan(0);
    }
  });

  it('refuses a price the listing does not carry and allows the one it does', () => {
    expect(checkDraft({ draft: 'It is Rs 1650.', facts: rice }).reasons).toContain('numbers');
    expect(checkDraft({ draft: 'It is Rs 1600 on our listing.', facts: rice }).ok).toBe(true);
    expect(checkDraft({ draft: 'It was listed at Rs 1900.', facts: rice }).ok).toBe(true);
  });

  it('refuses a timeframe no record published and allows the shop’s own', () => {
    const facts = { promise: '2 to 3 days' };
    expect(checkDraft({ draft: 'It reaches you in 24 hours.', facts }).reasons).toContain('numbers');
    expect(checkDraft({ draft: 'Our published time is 2 to 3 days.', facts }).ok).toBe(true);
  });

  it('refuses an empty draft instead of handing one back', () => {
    for (const draft of ['', '   ', null, undefined]) {
      expect(checkDraft({ draft, facts: rice })).toEqual({ ok: false, reasons: ['empty'] });
    }
  });

  it('lists every reason at once when a draft is wrong in several ways', () => {
    const verdict = checkDraft({ draft: 'We will refund you Rs 200 and send 5 pieces free.', facts: rice });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toEqual(expect.arrayContaining(['action', 'numbers']));
  });
});

describe('serverDraft — the line the shop gets instead', () => {
  it('answers a stock question with the state and never the quantity', () => {
    for (const [state, expected] of [
      ['IN_STOCK', 'in stock'],
      ['LOW_STOCK', 'running low'],
      ['OUT_OF_STOCK', 'out of stock'],
      ['NOT_TRACKED', 'on our listing'],
    ]) {
      // A name with no digits in it, so "no figure" below can only mean the
      // count: the quantity CityCart keeps to the shop alone.
      const line = serverDraft({
        family: 'availability',
        facts: { productName: 'Sella Rice', stockState: state },
        language: 'en',
      });
      expect(line).toContain(expected);
      expect(line).toMatch(/Sella Rice/);
      expect(line).not.toMatch(/\d/);
    }
  });

  it('states the listing price and the older listing price, nothing else', () => {
    const line = serverDraft({ family: 'price', facts: rice, language: 'en' });
    expect(line).toBe('Basmati Rice 5kg is Rs 1600 on our listing. It was listed at Rs 1900.');
    expect(
      serverDraft({ family: 'price', facts: { productName: 'Rice', price: 900 }, language: 'en' })
    ).toBe('Rice is Rs 900 on our listing.');
  });

  it('says the areas its own branches are in, and refuses a zone that is not one', () => {
    const facts = { zones: ['Gulberg III', 'DHA Phase 5'], zoneAsked: 'Model Town', coversZone: false };
    expect(serverDraft({ family: 'coverage', facts, language: 'en' })).toBe(
      'We do not deliver to Model Town. Our areas are Gulberg III, DHA Phase 5.'
    );
    expect(
      serverDraft({ family: 'coverage', facts: { ...facts, zoneAsked: 'Gulberg III', coversZone: true }, language: 'en' })
    ).toBe('Yes, we deliver to Gulberg III.');
    expect(serverDraft({ family: 'coverage', facts: { zones: ['Gulberg III'] }, language: 'en' })).toBe(
      'We deliver in Gulberg III.'
    );
  });

  it('quotes the published timeframe, and only that, for a timing question', () => {
    expect(serverDraft({ family: 'timing', facts: { promise: '2 to 3 days' }, language: 'en' })).toBe(
      'Our published delivery time is 2 to 3 days.'
    );
  });

  it('reads the order state off the record and names no order number', () => {
    const line = serverDraft({
      family: 'order',
      facts: { orderState: 'OUT_FOR_DELIVERY', itemCount: 3 },
      language: 'en',
    });
    expect(line).toBe('Your order is on its way with a rider (3 items).');
    expect(serverDraft({ family: 'order', facts: {}, language: 'en' })).toBe(
      'We cannot find an order from you with us yet.'
    );
  });

  it('says plainly when a return stands or does not, and why COD sends no money', () => {
    expect(
      serverDraft({ family: 'return', facts: { returnState: 'RECEIVED', refundAmount: 0 }, language: 'en' })
    ).toContain('nothing was collected at the door');
    expect(
      serverDraft({ family: 'return', facts: { returnState: 'IN_TRANSIT', refundAmount: 1200 }, language: 'en' })
    ).toBe('The return is on its way back to us.');
    expect(serverDraft({ family: 'return', facts: {}, language: 'en' })).toBe(
      'There is no return raised on your order with us.'
    );
  });

  it('answers a platform rule in the shop’s own voice', () => {
    expect(serverDraft({ family: 'rule', facts: { rule: 'fee' }, language: 'en' })).toContain(
      'no delivery fee'
    );
    expect(serverDraft({ family: 'rule', facts: { rule: 'coupon' }, language: 'en' })).toContain('no coupon');
  });

  it('asks which listing the customer means instead of picking one', () => {
    const line = serverDraft({ family: 'price', facts: { candidates: ['Basmati Rice 1kg', 'Basmati Rice 5kg'] }, language: 'en' });
    expect(line).toBe('Which item do you mean — Basmati Rice 1kg, Basmati Rice 5kg? Tell us the name and we can answer exactly.');
  });

  it('keeps a complaint apology free of both money and figures', () => {
    const line = serverDraft({ family: 'complaint', facts: {}, language: 'en' });
    expect(line).toContain('refuse it at the door');
    expect(checkDraft({ draft: line, facts: {} }).ok).toBe(true);
  });

  it('thanks for a review without promising anything', () => {
    expect(serverDraft({ family: 'review', facts: { rating: 2 }, language: 'en' })).toContain('fell short');
    expect(serverDraft({ family: 'review', facts: { rating: 5 }, language: 'en' })).toContain('Thank you');
    expect(makesActionClaim(serverDraft({ family: 'review', facts: { rating: 1 }, language: 'en' }))).toBe(false);
  });

  it.each([
    ['en', 'English'],
    ['ur', 'Urdu'],
    ['roman', 'Roman'],
  ])('answers a question CityCart has no record for in %s', (language) => {
    const line = serverDraft({ family: 'shopOnly', facts: {}, language });
    expect(line.length).toBeGreaterThan(10);
    expect(line).not.toMatch(/\d/);
    expect(makesActionClaim(line)).toBe(false);
  });

  it('falls back to English for a language it was not taught', () => {
    expect(serverDraft({ family: 'shopOnly', facts: {}, language: 'pashto' })).toBe(ACKNOWLEDGE_LINES.en);
    expect(serverDraft({ family: 'availability', facts: { productName: 'Rice', stockState: 'LOW_STOCK' }, language: 'fr' })).toBe(
      STOCK_LINES.LOW_STOCK.en('Rice')
    );
  });

  it('never states a figure the records did not carry, family by family', () => {
    const cases = [
      ['availability', { productName: 'Rice', stockState: 'IN_STOCK' }],
      ['price', rice],
      ['detail', { productName: 'Rice', details: [{ key: 'weight', value: '5 kg' }] }],
      ['coverage', { zones: ['Gulberg III'] }],
      ['timing', { promise: '2 to 3 days' }],
      ['order', { orderState: 'SHIPPED', itemCount: 2 }],
      ['return', { returnState: 'RECEIVED', refundAmount: 0 }],
      ['complaint', {}],
      ['rule', { rule: 'payment' }],
      ['review', { rating: 4 }],
      ['shopOnly', {}],
    ];
    for (const [family, facts] of cases) {
      for (const language of ['en', 'ur', 'roman']) {
        const line = serverDraft({ family, facts, language });
        expect(typeof line).toBe('string');
        expect({ family, language, ...checkDraft({ draft: line, facts }) }).toEqual({
          family,
          language,
          ok: true,
          reasons: [],
          missing: [],
        });
      }
    }
  });
});

describe('DECLINED_LINES — what the shop is told when there is nothing to read', () => {
  it.each([
    ['NO_HOURS_DATA', 'opening hours'],
    ['NO_CONTACT_DRAFT', 'contact details'],
    ['NO_DETAIL_DATA', 'no recorded detail'],
    ['NO_AUTHENTICITY_PROOF', 'original'],
    ['NO_PUBLISHED_PROMISE', 'delivery timeframe'],
    ['NO_BRANCH_ZONES', 'branch'],
    ['NO_LISTING_MATCH', 'which'],
    ['NO_ORDER', 'customer account'],
  ])('explains %s in plain words', (code, needle) => {
    expect(DECLINED_LINES[code]).toEqual(expect.any(String));
    expect(DECLINED_LINES[code].toLowerCase()).toContain(needle.toLowerCase());
  });

  it('names the screen that fixes the missing data', () => {
    expect(DECLINED_LINES.NO_PUBLISHED_PROMISE).toContain('Shop → Settings');
    expect(DECLINED_LINES.NO_BRANCH_ZONES).toContain('Shop → Branches');
  });
});
