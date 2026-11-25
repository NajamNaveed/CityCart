const Block = require('../../models/block.model');
const City = require('../../models/city.model');
const { getPlatformSettings } = require('../../services/adminSettings.service');
const { discoverForShopper } = require('./tools/area');
const { findAreaBlocks } = require('./location');

/**
 * The answers the server already knows, so a model cannot guess them
 * (docs/29 Phase 2h).
 *
 * Three families of customer questions used to land in a product search that
 * had nothing to say about them: "which block did I set?", "what is the
 * delivery fee?" and anything that is not about CityCart at all. Each is now
 * built here from the shopper's own saved location, the platform's own
 * settings, and the checkout rule the backend actually applies. No provider
 * call is spent, so an invented zone, fee or shop name is not possible.
 *
 * Only enforced rules are quoted. The COD order ceiling exists in settings but
 * checkout does not act on it yet, so it is deliberately left out of the
 * answer — telling a customer a limit that the backend ignores is its own kind
 * of wrong answer.
 */

const BLOCK_SCAN = 200;
const SHOP_PREVIEW = 3;

const URDU = /[\u0600-\u06ff]/;
const ROMAN_WORDS = new Set([
  'kahan', 'kahaa', 'kaha', 'mera', 'meri', 'meray', 'apna', 'apni', 'hain', 'hai', 'kya', 'kaise', 'kaisay',
  'kitna', 'kitni', 'kab', 'lekin', 'aur', 'bhi', 'se', 'tak', 'chahiye', 'chahta', 'chahti', 'kar', 'karo',
  'karein', 'ilaka', 'elaka', 'dukaan', 'dookan', 'aap', 'tum', 'yahan', 'wahan', 'nahi', 'nahin', 'bilkul',
  'sasta', 'sasti', 'doodh', 'zyada', 'acha', 'achha', 'bata', 'batao', 'dikha', 'dikhao', 'chahun', 'chahein',
  'liye', 'wala', 'wale', 'dena', 'lena', 'lein', 'doon', 'karta', 'karti', 'rehta', 'rehti', 'chalu', 'chalo',
  'khula', 'khuli', 'khulta', 'kitne', 'qareeb', 'bahar', 'andar',
  // The three little postpositions a Roman Urdu sentence is built out of. No
  // English word is spelled like this, and without them “rider ka number” reads
  // as English and gets an English reply back.
  'ka', 'ki', 'ko',
  // Roman Urdu pleasantries. A shopper who writes "shukriya" typed Roman Urdu,
  // and an English reply to it reads like the bot ignored the language.
  'shukriya', 'shukar', 'shukria', 'alvida', 'khuda', 'hafiz', 'allah',
]);

/** Which of the three languages the shopper wrote in, so the reply matches. */
function languageOf(text) {
  if (URDU.test(text)) return 'ur';
  const words = String(text).toLowerCase().split(/[^a-z]+/u).filter(Boolean);
  return words.some((word) => ROMAN_WORDS.has(word)) ? 'roman' : 'en';
}

function join(names) {
  const clean = names.filter(Boolean);
  if (clean.length <= 1) return clean[0] || '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

const say = (language, forms) => forms[language] || forms.en;

// A name lifted out of the sentence arrives lower-cased; echo it the way the
// shopper would write it.
const quoted = (value) =>
  String(value || '')
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const shopsAsked = (text) => /\b(?:stores?|shops?|markets?)\b/iu.test(text) || /دکان|دوکان/.test(text);

/**
 * Is a real delivery zone named in the question? Block names are matched whole
 * (longest first, so "DHA Phase 5" beats a shorter block called "DHA"), which
 * keeps the answer about a zone that exists instead of a phrase a model picked
 * out of the sentence.
 */
async function areaNamedIn(text, cityId) {
  const found = await Block.find({ isActive: true, ...(cityId ? { cityId } : {}) })
    .select('name cityId')
    .lean()
    .limit(BLOCK_SCAN);
  const haystack = ` ${String(text).toLowerCase()} `;
  return (
    found
      .sort((a, b) => String(b.name).length - String(a.name).length)
      .find((block) => haystack.includes(` ${String(block.name).toLowerCase()} `)) || null
  );
}

// The little words a place name is mentioned after. "me" is deliberately not
// one of them: in Roman Urdu it also appears inside ordinary English orders.
const AREA_CUE = /^(?:to|in|into|at|near|for|ka|ki|ke|mein|par)$/u;

// These only ever mean "the place around me" or ordinary speech, so "do you
// deliver to my area?" stays a question about the shopper's own block instead of
// a search for a zone called "my area" — and "show me all the stores in my
// block" is never read as a zone called "all".
const AREA_SKIP = new Set([
  'my', 'the', 'this', 'that', 'your', 'our', 'mera', 'meri', 'meray', 'apna', 'apni', 'aap', 'tum',
  'area', 'zones', 'zone', 'block', 'blocks', 'locality', 'city', 'town', 'location', 'address',
  'ilaka', 'elaka', 'deliver', 'delivery', 'delivering', 'covered', 'range', 'home', 'house',
  'shop', 'shops', 'store', 'stores', 'place', 'here', 'there', 'kahan', 'kahaa',
  'all', 'any', 'some', 'many', 'more', 'most', 'other', 'others', 'list', 'listing', 'listings',
  'show', 'shows', 'send', 'tell', 'know', 'want', 'need', 'have', 'has', 'does', 'could', 'would',
  'should', 'will', 'please', 'kindly', 'also', 'only', 'just', 'about', 'from', 'with', 'what',
  'which', 'when', 'where', 'why', 'how', 'nearby', 'near', 'available', 'availability', 'open',
  'opens', 'best', 'cheap', 'cheaper', 'cheapest', 'order', 'orders', 'item', 'items', 'product',
  'products', 'market', 'markets', 'nahi', 'nahin', 'nhi', 'bilkul', 'zaroor', 'liye', 'wala',
  'wale', 'zyada', 'kam', 'acha', 'achha', 'abhi', 'kal', 'aaj', 'bhi', 'aur', 'kya', 'kyu', 'kyun',
]);

/**
 * The place names a question mentions, longest first: "do you deliver to DHA
 * phase 5" offers "dha phase 5", then "dha phase", then "dha".
 */
function areaMentions(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const phrases = [];
  for (let i = 0; i < words.length; i += 1) {
    if (!AREA_CUE.test(words[i])) continue;
    for (let end = Math.min(words.length, i + 4); end > i; end -= 1) {
      const kept = words.slice(i + 1, end).filter((word) => word.length >= 3 && !AREA_SKIP.has(word));
      const phrase = kept.join(' ');
      if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
    }
  }
  return phrases;
}

/** A city the shopper named, but only if CityCart actually operates there. */
async function namedCity(term) {
  const text = String(term || '').trim();
  if (text.length < 3) return null;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return City.findOne({ isActive: true, name: { $regex: `^${escaped}\\b`, $options: 'i' } })
    .select('name')
    .lean();
}

/**
 * What the question is about: a real delivery block, a real CityCart city, or a
 * name CityCart has no zone for. The third case is answered plainly; it used to
 * fall through to the shopper's own block, which is a different answer.
 */
async function namedPlace(text, cityId) {
  const exact = await areaNamedIn(text, cityId);
  if (exact) {
    return {
      kind: 'block',
      name: exact.name,
      names: [exact.name],
      cityId: String(exact.cityId),
      blockIds: [String(exact._id)],
    };
  }
  const mentions = areaMentions(text);
  for (const mention of mentions) {
    // The shopper's own city is checked first, then the whole platform: "do you
    // deliver to DHA" asked in Lahore is about Karachi's DHA, not a zone that
    // does not exist.
    let found = await findAreaBlocks(mention, { cityId, limit: 3 });
    if (!found.length) found = await findAreaBlocks(mention, { limit: 3 });
    if (found.length) {
      // Every search below is city-scoped, so a name that matches zones in two
      // cities is answered inside one of them — the first match's.
      const cityName = found[0].cityName;
      const blocks = found.filter((block) => block.cityName === cityName);
      return {
        kind: 'block',
        name: blocks[0].name,
        names: blocks.map((block) => block.name),
        cityName,
        blockIds: blocks.map((block) => block._id),
      };
    }
    const city = await namedCity(mention);
    if (city) return { kind: 'city', name: city.name, names: [city.name], cityId: String(city._id) };
  }
  return mentions.length ? { kind: 'unknown', name: mentions[0] } : null;
}

async function storesInScope(scope) {
  const found = await discoverForShopper(scope, {});
  return {
    outsideBlock: Boolean(found.outsideBlock),
    blockNames: found.searched.blockNames,
    total: found.total,
    shops: found.items.slice(0, SHOP_PREVIEW).map((store) => ({
      _id: String(store._id),
      name: store.name,
      km: store.nearestKm === undefined ? null : store.nearestKm,
      blocks: [...new Set(store.branches.map((branch) => branch.blockName).filter(Boolean))].slice(0, 3),
      acceptingNewOrders: store.acceptingNewOrders !== false,
    })),
  };
}

/** The places are never the shopper's own: search the named zone or city only. */
function storesInPlace(place) {
  return storesInScope({
    cityId: place.cityId || null,
    lat: null,
    lng: null,
    blockIds: place.blockIds || [],
    blockNames: place.names || [],
  });
}

/** "Brand X (1.2 km)" — distance only when discovery actually measured it. */
function nearestLabels(shops, language) {
  return shops
    .map((shop) => `${shop.name}${shop.km === null || shop.km === undefined ? '' : ` (${shop.km} km)`}`)
    .join(language === 'ur' ? '، ' : ', ');
}

/**
 * "shops in Karachi" asks for the shops in a place; it is not a product search
 * that happens to match the word "Karachi". Only the database knows which words
 * name a place, so this is the one routing decision the server can only make
 * after a read (docs/29 Phase 2h). It returns the place — including a place
 * CityCart has no zone for — so the caller answers about that place instead of
 * showing items, and does not look it up twice.
 */
async function namedPlaceAsked(text, cityId = null) {
  if (!shopsAsked(text)) return null;
  return namedPlace(text, cityId);
}

/**
 * "Which block am I in?", "do you deliver to my area?", "shops in my block",
 * "do you deliver to DHA", "shops in Karachi".
 *
 * The answer is a sentence plus the real shop cards the same search returned,
 * each carrying the block names it is actually in — so a shop from another part
 * of the city can be shown without ever being called nearby.
 */
async function answerLocation({ text, scope, place: givenPlace = null }) {
  const language = languageOf(text);
  const place = givenPlace || (await namedPlace(text, scope.cityId));

  // A zone name CityCart has never heard of. It used to fall through and get
  // answered with the shopper's own block, which is a different place.
  if (place && place.kind === 'unknown') {
    const name = quoted(place.name);
    const own = scope.blockNames.length ? join(scope.blockNames) : null;
    return {
      reply: say(language, {
        en: own
          ? `CityCart has no delivery zone called “${name}”, so nothing is delivered there. Your own location is ${own} — ask me about shops there.`
          : `CityCart has no delivery zone called “${name}”, so nothing is delivered there. Set your location on the Nearby page and I can search your own area.`,
        ur: own
          ? `CityCart میں “${name}” نام کا کوئی ڈیلیوری زون نہیں، اس لیے وہاں سامان نہیں پہنچایا جا سکتا۔ آپ کا اپنا مقام ${own} ہے — مجھ سے وہاں کی دکانوں کے بارے میں پوچھیں۔`
          : `CityCart میں “${name}” نام کا کوئی ڈیلیوری زون نہیں، اس لیے وہاں سامان نہیں پہنچایا جا سکتا۔ نیئر والے صفحے پر اپنا مقام سیٹ کریں، میں آپ کے علاقے میں تلاش کر دوں گا۔`,
        roman: own
          ? `CityCart mein “${name}” naam ka koi delivery zone nahi, is liye wahan saman nahi pohanchaya ja sakta. Aap ka apna location ${own} hai — mujh se wahan ki shops ke baare mein poochein.`
          : `CityCart mein “${name}” naam ka koi delivery zone nahi, is liye wahan saman nahi pohanchaya ja sakta. Nearby page par apna location set karein, main aap ke area mein dhoondta hoon.`,
      }),
      stores: [],
    };
  }

  if (place) {
    const where = join(place.names && place.names.length ? place.names : [place.name]);
    const city = place.cityName
      ? language === 'ur'
        ? `، ${place.cityName}`
        : `, ${place.cityName}`
      : '';
    const there = await storesInPlace(place);
    const names = there.shops.map((shop) => shop.name);

    if (there.outsideBlock) {
      return {
        reply: say(language, {
          en: names.length
            ? `CityCart delivers to ${where}${city}, but no shop has opened there yet. These are in other parts of the city: ${nearestLabels(
                there.shops,
                language
              )}.`
            : `CityCart has a delivery zone in ${where}${city}, but no shop has opened there yet — or anywhere else in this city.`,
          ur: names.length
            ? `CityCart ${where}${city} میں ڈیلیوری کرتا ہے، لیکن ابھی وہاں کوئی دکان نہیں کھلی۔ یہ دکانیں شہر کے دیگر علاقوں میں ہیں: ${nearestLabels(
                there.shops,
                language
              )}.`
            : `CityCart میں ${where}${city} کا ڈیلیوری زون تو ہے، لیکن وہاں اور اس شہر میں کہیں ابھی کوئی دکان نہیں کھلی۔`,
          roman: names.length
            ? `CityCart ${where}${city} mein delivery karta hai, lekin abhi wahan koi shop nahi khuli. Yeh shops sheher ke dusre areas mein hain: ${nearestLabels(
                there.shops,
                language
              )}.`
            : `CityCart mein ${where}${city} ka delivery zone to hai, lekin wahan aur is sheher mein kahin bhi abhi koi shop nahi khuli.`,
        }),
        stores: there.shops,
      };
    }

    if (names.length) {
      return {
        reply: say(language, {
          en: `Yes — CityCart ${
            place.kind === 'city' ? 'operates in' : 'delivers to'
          } ${where}${city}, and ${there.total} ${
            there.total === 1 ? 'shop is' : 'shops are'
          } there: ${join(names)}${
            there.total > names.length ? (language === 'ur' ? '۔ باقی دکانیں نیئر والے صفحے پر ہیں۔' : '. More are on the Nearby page.') : ''
          }`,
          ur: `جی ہاں — CityCart ${where}${city} میں ڈیلیوری کرتا ہے، وہاں ${there.total} دکان ${
            there.total === 1 ? 'ہے' : 'ہیں'
          }: ${names.join('، ')}${
            there.total > names.length ? '۔ باقی دکانیں نیئر والے صفحے پر ہیں' : ''
          }۔`,
          roman: `Haan — CityCart ${where}${city} mein delivery karta hai, wahan ${there.total} shop ${
            there.total === 1 ? 'hai' : 'hain'
          }: ${names.join(', ')}${there.total > names.length ? '. Baqi shops Nearby page par hain' : ''}.`,
        }),
        stores: there.shops,
      };
    }

    return {
      reply: say(language, {
        en: `CityCart has a delivery zone in ${where}${city}, but no shop is listed there yet.`,
        ur: `CityCart میں ${where}${city} کا ڈیلیوری زون تو ہے، لیکن ابھی وہاں کوئی دکان درج نہیں ہے۔`,
        roman: `CityCart mein ${where}${city} ka delivery zone to hai, lekin abhi wahan koi shop listed nahi hai.`,
      }),
      stores: [],
    };
  }

  if (scope.source === 'none') {
    return {
      reply: say(language, {
        en: 'You have not set a location yet, so I cannot tell you which block you are in. Choose your block — or drop a pin — on the Nearby page, then ask me again.',
        ur: 'آپ نے ابھی مقام سیٹ نہیں کیا، اس لیے میں آپ کا بلاک نہیں بتا سکتا۔ نیئر والے صفحے پر اپنا بلاک چنیں یا پن لگائیں، پھر دوبارہ پوچھیں۔',
        roman:
          'Aap ne abhi location set nahi ki, is liye main aap ka block nahi bata sakta. Nearby page par apna block chunein ya pin lagayein, phir dobara poochein.',
      }),
      stores: [],
    };
  }

  if (!scope.blockNames.length) {
    return {
      reply: say(language, {
        en: `Your location${scope.addressLabel ? ` (“${scope.addressLabel}”)` : ''} is not inside a CityCart delivery zone yet, so no shop can bring an order there.`,
        ur: `آپ کا مقام${scope.addressLabel ? ` (“${scope.addressLabel}”)` : ''} ابھی کسی ڈیلیوری زون کے اندر نہیں ہے، اس لیے وہاں کوئی دکان سامان نہیں لا سکتی۔`,
        roman: `Aap ka location${
          scope.addressLabel ? ` (“${scope.addressLabel}”)` : ''
        } abhi kisi delivery zone ke andar nahi hai, is liye wahan koi shop saman nahi la sakti.`,
      }),
      stores: [],
    };
  }

  const where = join(scope.blockNames);
  const city = scope.cityName ? (language === 'ur' ? `، ${scope.cityName}` : `, ${scope.cityName}`) : '';

  if (!shopsAsked(text)) {
    return {
      reply: say(language, {
        en: `Your location is set to ${where}${city}${
          scope.addressLabel ? ` (saved address “${scope.addressLabel}”)` : ''
        }. CityCart delivers there.`,
        ur: `آپ کا مقام ${where}${city} سیٹ ہے${
          scope.addressLabel ? ` (پتہ “${scope.addressLabel}”)` : ''
        }۔ CityCart آپ تک ڈیلیوری کرتا ہے۔`,
        roman: `Aap ka location ${where}${city} set hai${
          scope.addressLabel ? ` (address “${scope.addressLabel}”)` : ''
        }. CityCart aap tak delivery karta hai.`,
      }),
      stores: [],
    };
  }

  const near = await storesInScope(scope);
  if (near.shops.length && !near.outsideBlock) {
    const names = near.shops.map((shop) => shop.name);
    return {
      reply: say(language, {
        en: `${near.total} ${near.total === 1 ? 'shop is' : 'shops are'} in ${where}: ${join(names)}.${
          near.total > names.length ? (language === 'ur' ? ' باقی دکانیں نیئر والے صفحے پر ہیں۔' : ' More are on the Nearby page.') : ''
        }`,
        ur: `${where} میں ${near.total} دکان ${near.total === 1 ? 'ہے' : 'ہیں'}: ${names.join('، ')}${
          near.total > names.length ? '۔ باقی دکانیں نیئر والے صفحے پر ہیں' : ''
        }۔`,
        roman: `${where} mein ${near.total} shop ${near.total === 1 ? 'hai' : 'hain'}: ${names.join(', ')}${
          near.total > names.length ? '. Baqi shops Nearby page par hain' : ''
        }.`,
      }),
      stores: near.shops,
    };
  }

  const elsewhere = nearestLabels(near.shops, language);
  return {
    reply: say(language, {
      en: elsewhere
        ? `No CityCart shop is in ${where} yet. The nearest are ${elsewhere}, outside your block.`
        : `No CityCart shop is in ${where} yet, and none has opened in this city.`,
      ur: elsewhere
        ? `${where} میں ابھی کوئی CityCart دکان نہیں ہے۔ سب سے قریبی ${elsewhere} ہیں، آپ کے بلاک سے باہر۔`
        : `${where} میں ابھی کوئی CityCart دکان نہیں، اور اس شہر میں بھی کوئی نہیں کھلی۔`,
      roman: elsewhere
        ? `${where} mein abhi koi CityCart shop nahi hai. Sab se qareeb ${elsewhere} hain, aap ke block se bahar.`
        : `${where} mein abhi koi CityCart shop nahi, aur is city mein bhi koi nahi khula.`,
    }),
    stores: near.shops,
  };
}

/**
 * The two halves of a “when” question, kept apart on purpose.
 *
 * `scheduleAsked` is the shopper asking when the marketplace works — CityCart
 * stores no opening hours, no 24/7 flag and no holiday calendar, so that is one
 * plain sentence. `timeOfDayAsked` only says when they want their order, which
 * is answered better by the zone they named: “do you deliver to DHA tonight”
 * wants to know whether DHA is served at all.
 */
function scheduleAsked(text) {
  return (
    /\bopen\b|\bclosing\b|\btimings?\b|\btill\s+what\s+time\b|khulta|khuli|khule|band/iu.test(text) ||
    // "what time does the shop close" asks the same unstored fact without the
    // word “timing”. “closest” is a distance, so it is not matched here.
    /\b(?:what|when|why|how\s+late)\b[^.!?]{0,32}\b(?:clos(?:e|es|ed|ing)|open(?:s|ed|ing)?)\b/iu.test(text) ||
    /\b(?:24\s*\/\s*7|24\s*x\s*7|24\s*(?:hours|hrs)|round\s+the\s+clock|7\s*days|seven\s+days|all\s+day)\b/iu.test(
      text
    ) ||
    // A named day or a holiday is the same unstored schedule, asked without the
    // word “open”.
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|eid|ramadan|rozan|chutti|holiday)\b/iu.test(text) ||
    /\bkab\s+tak\b/iu.test(text) ||
    /کھل|بند|اوقات|ٹائمز|ٹائمنگز|شیدول|عید|رمضان|چھٹی|جمعرات|جمعہ|ہفتہ|اتوار|پیر|منگل|بدھ/.test(text)
  );
}

function timeOfDayAsked(text) {
  return (
    /\b(?:today|tonight|tomorrow|morning|afternoon|evening|night|midnight|sham|subah|raat|dopehar)\b/iu.test(text) ||
    /\b(?:\d{1,2}\s*(?:am|pm)|after\s+\d|before\s+\d|till\s+\d)\b/iu.test(text)
  );
}

const ASKS = {
  fee: (text) =>
    /\bdelivery\b[^.!?]{0,24}\b(?:fee|charge|charges|cost|rate|free|kitna|kitni)\b/iu.test(text) ||
    /\b(?:fee|charges?|cost)\b[^.!?]{0,24}\bdelivery\b/iu.test(text) ||
    /\bhow\s+much\b[^.!?]{0,24}\bdelivery\b/iu.test(text) ||
    /shipping[^.!?]{0,16}(fee|charge)/i.test(text) ||
    /ڈیلیوری[^۔!؟]{0,12}(فی|چارج|کتنی|قیمت|مفت)/.test(text),
  freeDelivery: (text) => /free\s+delivery/iu.test(text) || /مفت[^۔!؟]{0,12}ڈیلیوری|ڈیلیوری[^۔!؟]{0,12}مفت/.test(text),
  payment: (text) =>
    /cash\s+on\s+delivery|\bcod\b|\bpay\b|\bpayment\b|\bpaid\b|\bcard\b|easypay|jf\s*khalti|\bkhareed\b/iu.test(text) ||
    /\b(?:installments?|instalments?|emi|part\s+payment|advance\s+payment)\b/iu.test(text) ||
    /\b(?:jazzcash|jazz\s+cash|easypaisa|easy\s*paisa|bank\s+transfer|direct\s+deposit|upi|paypal|wallet\s*(?:payment|app)|online\s+payment)\b/iu.test(
      text
    ) ||
    /\b(?:accept|take|support|allow)\b[^.!?]{0,16}\b(?:cash|card|visa|master|online|bank)\b/iu.test(text) ||
    /ادائیگی|کیش|پیسے|کارڈ|قسط|آن\s?لائن|بینک|والٹ/.test(text),
  minimum: (text) => /\bminimum\b[^.!?]{0,16}\b(?:order|amount|purchase)\b/iu.test(text) || /کم\s?از\s?کم/.test(text),
  hours: (text) => scheduleAsked(text) || timeOfDayAsked(text),
  schedule: scheduleAsked,
  account: (text) =>
    /\b(?:cart|basket|wishlist|addresses|address|profile|account|sign\s*[-\s]?up|log\s*in|login|registration)\b/iu.test(
      text
    ) ||
    /\bkahan\b[^.!?]{0,20}\b(?:cart|address|account)\b/iu.test(text) ||
    /اکاؤنٹ|اکاونٹ|پتہ|ٹوکری/.test(text),
  eta: (text) =>
    /\bdelivery\b[^.!?]{0,16}\b(?:time|timing|how\s+long|take)\b/iu.test(text) ||
    /\bhow\s+long\b[^.!?]{0,20}\b(?:delivery|deliver|arrive|take)\b/iu.test(text) ||
    /ڈیلیوری[^۔!؟]{0,12}(?:وقت|لگ)/.test(text),
  howToOrder: (text) =>
    /\bhow\s+(?:do\s+i|to|can\s+i)\s+(?:order|shop|buy)\b|\border\s+kaise\b|\bkaise\s+order\b/iu.test(text) ||
    /کیسے\s?(آرڈر|خرید)/.test(text),
  support: (text) =>
    /\b(?:support|helpline|complaint|customer\s+care)\b/iu.test(text) ||
    /\b(?:speak|talk|chat)\b[^.!?]{0,18}\b(?:to\s+)?(?:a\s+|the\s+)?(?:human|person|agent|representative|customer\s+service)\b/iu.test(text) ||
    /\b(?:human|real)\s+(?:agent|support|person)\b/iu.test(text) ||
    /شکایت|سپورٹ/.test(text),
  // The paper left behind by a paid order. CityCart has no invoice request.
  receipt: (text) =>
    /\b(?:invoice|receipt|payment\s+proof|sale\s+slip|bill\s+(?:copy|receipt|proof|chahiye)|copy\s+(?:of\s+)?(?:the\s+)?bill)\b/iu.test(
      text
    ) ||
    /\bbill\b[^.!?]{0,16}\b(?:chahiye|chaiye|nahi\s+(?:aaya|mile|aayi)|copy|proof|do|mila)\b/iu.test(text) ||
    /بل[^۔!؟]{0,10}چاہیے|رسید|انوائس/.test(text),
  // A phone number the chat either must not carry or cannot read.
  contact: (text) =>
    /\b(?:rider|delivery\s+boy|shop|store|dukaan|seller|provider|market)(?:'s|s| ki| ka)?\b[^.!?]{0,18}\b(?:number|no\.?|phone|mobile|whatsapp|contact|call|na?mber)\b/iu.test(
      text
    ) ||
    /\b(?:number|phone|mobile|whatsapp|contact)\b[^.!?]{0,18}\b(?:of\s+|for\s+|ka|ki)\s*(?:the\s+|a\s+|my\s+)?(?:rider|shop|store|seller|provider|dukaan)\b/iu.test(
      text
    ) ||
    /\b(?:call|phone\s+(?:kar|lag|karna))\b[^.!?]{0,16}\b(?:the\s+|a\s+|meri\s+|myna\s+)?(?:rider|shop|store|dukaan)\b/iu.test(text) ||
    /(رائیڈر|دکان)[^۔!؟]{0,14}(?:نمبر|فون|کال)/.test(text),
  // Earning on CityCart instead of buying from it.
  sell: (text) =>
    /\b(?:how\s+(?:do\s+i|can\s+i|to)|i\s+want\s+to|want\s+to|i\s+need\s+to)\b[^.!?]{0,20}\b(?:sell|become|open\s+(?:a|my)\s+(?:shop|store|market|dukaan)|start\s+(?:a|my)\s+(?:shop|store|business)|list\s+my)\b/iu.test(
      text
    ) ||
    /\b(?:become|work\s+as|join)\s+(?:a\s+|an\s+|the\s+)?(?:seller|shopkeeper|rider|delivery\s+(?:boy|person|guy|partner)|service\s+provider|electrician|plumber|partner)\b/iu.test(
      text
    ) ||
    /\b(?:apply|application)\b[^.!?]{0,24}\b(?:as|for|to)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:seller|shop|store|rider|provider|service|partner|business)\b/iu.test(
      text
    ) ||
    /\b(?:sell|store|shop|product)s?\b[^.!?]{0,16}\bon\s+citycart\b/iu.test(text) ||
    /\b(?:seller|rider|provider|shop|store)\s*(?:apply|application|registration|portal|sign\s*[-\s]?up)\b/iu.test(text) ||
    /\b(?:register|registration)\b[^.!?]{0,20}\b(?:as|on|with)\b[^.!?]{0,16}\b(?:seller|shop|store|rider|provider|partner|citycart)\b/iu.test(
      text
    ) ||
    /\b(?:dukaan|shop|store)\b[^.!?]{0,16}\b(?:kaise\s+khol|kholna|kholni|kahan\s+se\s+khol)\b/iu.test(text) ||
    /(دکان[^۔!؟]{0,12}(?:کھول|رجسٹر|اپلائی)|فروخت[^۔!؟]{0,12}(?:کرن|شروع)|رائیڈر[^۔!؟]{0,12}(?:بن|کام\s?مل|نوکری))|((?:سیلر|پرووائڈر|رائیڈر)[^۔!؟]{0,12}(?:اپلائی|رجسٹر|کیلے|کیلئے))/u.test(
      text
    ),
  // Signing in again is a page, not a secret the chat can hand over.
  password: (text) =>
    /\b(?:forgot|reset|change|update|create|set)\w*\b[^.!?]{0,16}\b(?:my\s+|apna\s+|mera\s+)?password\b/iu.test(text) ||
    /\bpassword\b[^.!?]{0,20}\b(?:forgot|reset|kaise|kaisay|how|link|change|badal)\b/iu.test(text) ||
    /\b(?:password|log\s*in|login)\s+(?:nahi|not)\s+(?:ho\s+raha|raha|chalu|kaam)\b/iu.test(text) ||
    /(?:پاس\s?ورڈ|پاسورڈ)[^۔!؟]{0,16}(?:بھول|ری\s?سیٹ|بدل|کیسے)/u.test(text),
  // The checkout total is added by the server, so “why is it more” has one answer.
  total: (text) =>
    /\b(?:why|kyun|kyu|kis\s+liye)\b[^.!?]{0,24}\b(?:total|amount|bill|price|cost|checkout)\b[^.!?]{0,24}\b(?:more|less|different|high|zyada|barh|change[d]?)\b/iu.test(
      text
    ) ||
    /\b(?:total|amount|checkout)\b[^.!?]{0,20}\b(?:more|zyada|different|high)\b[^.!?]{0,16}\b(?:than|from|of|to)\b/iu.test(text),
};

/**
 * The place a rules question is really about, or null when it is about the
 * rule. "do you deliver to DHA tonight" mentions a zone and wants to know
 * whether it is served; "what is the delivery fee in DHA" mentions the same
 * zone only to ask about money, which is the same everywhere. A name the
 * database has no zone for is not a place either — "do you deliver in the
 * evening" would otherwise be answered with a zone called Evening.
 */
async function namedRulePlace(text, cityId = null) {
  if (
    ASKS.fee(text) ||
    ASKS.freeDelivery(text) ||
    ASKS.payment(text) ||
    ASKS.minimum(text) ||
    ASKS.eta(text) ||
    ASKS.howToOrder(text) ||
    ASKS.support(text) ||
    ASKS.schedule(text) ||
    ASKS.account(text) ||
    ASKS.password(text) ||
    ASKS.receipt(text) ||
    ASKS.contact(text) ||
    ASKS.sell(text) ||
    ASKS.total(text)
  ) {
    return null;
  }
  const place = await namedPlace(text, cityId);
  return place && place.kind !== 'unknown' ? place : null;
}

/** Money and how-it-works questions, answered from what the backend enforces. */
async function answerPolicy({ text }) {
  const language = languageOf(text);
  const settings = await getPlatformSettings();
  const support = [settings.supportEmail, settings.supportPhone].filter(Boolean);

  if (ASKS.fee(text) || ASKS.freeDelivery(text)) {
    return say(language, {
      en: 'CityCart does not add a delivery fee to your bill right now — you pay the item prices the shop lists, and that is the total you see at checkout.',
      ur: 'CityCart ابھی آپ کے بل میں الگ ڈیلیوری فیس شامل نہیں کرتا — آپ وہی قیمت ادا کرتے ہیں جو دکان نے سامان پر لگائی ہے، اور یہی رقم چیک آؤٹ پر کل ٹوٹل کے طور پر نظر آتی ہے۔',
      roman: 'CityCart abhi aap ke bill mein alag delivery fee add nahi karta — aap wahi price pay karte hain jo shop ne item par lagai hai, aur yehi amount checkout par total dikhta hai.',
    });
  }

  if (ASKS.payment(text)) {
    return say(language, {
      en: 'You pay cash to the rider when the order arrives — that is the only payment method today. Online payment, cards and easypay or JK Khalti are not switched on yet, so nothing is charged before the goods reach you.',
      ur: 'آپ سامان پہنچنے پر رائیڈر کو نقد رقم دیتے ہیں — آج صرف یہی طریقہ ادائیگی ہے۔ آن لائن ادائیگی، کارڈ، easypay یا JK Khalti ابھی چالو نہیں ہیں، اس لیے آپ تک سامان پہنچنے سے پہلے کچھ نہیں کٹتا۔',
      roman: 'Aap saman pohanchne par rider ko cash dete hain — aaj sirf yehi payment method hai. Online payment, card, easypay ya JK Khalti abhi chalu nahi hain, is liye aap tak saman pohanchne se pehle kuch nahi katta.',
    });
  }

  if (ASKS.minimum(text)) {
    return say(language, {
      en: 'CityCart has no minimum order — one item from a shop is enough. A shop can note its own rules on its page, so read the listing before ordering.',
      ur: 'CityCart کا کوئی کم از کم آرڈر نہیں — دکان سے ایک سامان بھی منگا جا سکتا ہے۔ دکان اپنے قواعد اپنے صفحے پر لکھ سکتی ہے، اس لیے آرڈر سے پہلے لسٹ دیکھ لیں۔',
      roman: 'CityCart ka koi minimum order nahi — shop se ek item bhi manga ja sakta hai. Shop apne rules apne page par likh sakti hai, is liye order se pehle listing dekhein.',
    });
  }

  if (ASKS.eta(text)) {
    return say(language, {
      en: 'CityCart does not publish a delivery time — the shop you order from sets it. The order is confirmed by the shop first, then a rider brings it, and every step shows under My Orders. Ask me “where is my order?” and I will read your own order’s status.',
      ur: 'CityCart کوئی ڈیلیوری کا وقت مقرر نہیں کرتا — وقت وہ دکان بتاتی ہے جس سے آپ آرڈر کرتے ہیں۔ پہلے دکان آرڈر کی تصدیق کرتی ہے، پھر رائیڈر سامان پہنچاتا ہے اور ہر مرحلہ My Orders میں نظر آتا ہے۔ مجھ سے “میرا آرڈر کہاں ہے؟” پوچھیں تو میں آپ کے آرڈر کی اصل حالت بتا دوں گا۔',
      roman: 'CityCart koi delivery time fix nahi karta — time woh shop batati hai jis se aap order karte hain. Pehle shop order confirm karti hai, phir rider saman pohanchata hai aur har step My Orders mein dikhta hai. Mujh se “mera order kahan hai?” poochein to main aap ke order ki asli status bata doon ga.',
    });
  }

  if (ASKS.hours(text)) {
    return say(language, {
      en: 'CityCart does not store a shop’s opening hours, so I cannot say whether it is open this minute. You can order any time; the shop confirms when it accepts, and you can message it from its page.',
      ur: 'CityCart دکان کے کھلنے کے اوقات محفوظ نہیں کرتا، اس لیے میں یہ نہیں بتا سکتا کہ اس وقت دکان کھلی ہے یا بند۔ آپ کسی بھی وقت آرڈر کر سکتے ہیں؛ دکان جب قبول کرے گی تو سامان تیار ہوگا، اور آپ اسے اس کے صفحے سے پیغام بھیج سکتے ہیں۔',
      roman: 'CityCart shop ke opening hours store nahi karta, is liye main nahi bata sakta ke is waqt shop khuli hai ya band. Aap kabhi bhi order kar sakte hain; shop jab accept kare gi to saman tayyar hoga, aur aap usay us ke page se message bhej sakte hain.',
    });
  }

  if (ASKS.howToOrder(text)) {
    return say(language, {
      en: 'Set your location on the Nearby page, open a shop, add items to the cart and press order. The shop confirms and a rider brings it; you pay cash on delivery.',
      ur: 'نیئر والے صفحے پر اپنا مقام سیٹ کریں، دکان کھولیں، سامان ٹوکری میں ڈالیں اور آرڈر دبائیں۔ دکان تصدیق کرتی ہے اور رائیڈر پہنچاتا ہے؛ ادائیگی ڈیلیوری پر نقد۔',
      roman: 'Nearby page par apna location set karein, shop kholen, items cart mein daalen aur order dabaen. Shop confirm karti hai aur rider pohanchata hai; payment delivery par cash.',
    });
  }

  if (ASKS.password(text)) {
    return say(language, {
      en: 'I cannot set, reset or read a password, and no one at CityCart will hand yours over. On the sign-in page press “Forgot password”, give your email and the link CityCart sends lets you choose a new one yourself.',
      ur: 'میں پاس ورڈ نہ بنا سکتا ہوں، نہ ری سیٹ، نہ پڑھ سکتا ہوں، اور CityCart کا کوئی شخص آپ کا پاس ورڈ نہیں دے گا۔ سائن ان کے صفحے پر “Forgot password” دبائیں، اپنا ای میل دیں تو CityCart جو لنک بھیجے گا اسی سے آپ خود نیا پاس ورڈ رکھ سکتے ہیں۔',
      roman: 'Main password na bana sakta hoon, na reset, na parh sakta hoon, aur CityCart ka koi shakhs aap ka password nahi dega. Sign-in page par “Forgot password” dabaen, apna email dein; CityCart jo link bhejega us se aap khud naya password rakh sakte hain.',
    });
  }

  if (ASKS.receipt(text)) {
    return say(language, {
      en: 'CityCart does not write an invoice on request. When an order is paid, its receipt appears on that order’s own page — open Orders, choose the order and the receipt is there. On cash on delivery it appears once the rider has collected the money.',
      ur: 'CityCart درخواست پر انوائس نہیں بناتا۔ جب آرڈر کی ادائیگی ہو جاتی ہے تو اس کی رسید اسی آرڈر کے صفحے پر نظر آتی ہے — Orders کھولیں، آرڈر چنیں اور رسید وہاں موجود ہوگی۔ کیش آن ڈیلیوری میں رسید رائیڈر کے رقم وصول کرنے کے بعد بنتی ہے۔',
      roman: 'CityCart request par invoice nahi banata. Jab order ki payment ho jati hai us ki receipt us order ke apne page par dikhti hai — Orders kholen, order chunein aur receipt wahan hai. Cash on delivery mein receipt rider ke paisay lene ke baad banti hai.',
    });
  }

  if (ASKS.contact(text)) {
    return say(language, {
      en: 'I cannot give out a rider’s number and I cannot call anyone for you. While an order is on its way, your order page shows the rider moving toward you on the map. A shop’s own phone, if it published one, is on that shop’s page under Contact.',
      ur: 'میں رائیڈر کا نمبر نہیں دے سکتا اور نہ آپ کی طرف سے کال کر سکتا ہوں۔ جب آرڈر راستے میں ہو تو آرڈر کا صفحہ نقشے پر رائیڈر آپ کی طرف آتے دکھاتا ہے۔ دکان کا اپنا فون، اگر اس نے شائع کیا ہو، اسی دکان کے صفحے پر Contact میں لکھا ہوتا ہے۔',
      roman: 'Main rider ka number nahi de sakta aur na aap ki taraf se call kar sakta hoon. Jab order raste mein ho to order ka page map par rider aap ki taraf aate dikhata hai. Shop ka apna phone, agar us ne publish kiya ho, usi shop ke page par Contact mein likha hota hai.',
    });
  }

  if (ASKS.sell(text)) {
    return say(language, {
      en: 'That is not done in this chat. To sell, open the Sell page and press Apply — that is how a shop joins CityCart. A plumber, electrician or salon applies on the service-provider application page. A rider account is created by the shop or provider that employs riders, so there is no rider sign-up here.',
      ur: 'یہ کام یہ چیٹ میں نہیں ہوتا۔ بیچنے کے لیے Sell کا صفحہ کھولیں اور Apply دبائیں — اسی سے دکان CityCart میں شامل ہوتی ہے۔ نلکاری، بجلی والا یا سیڈون اپنا نامزدگی فارم سروس پرووائڈر اپلائی کے صفحے پر بھرتا ہے۔ رائیڈر کا اکاؤنٹ وہ دکان یا پرووائڈر بناتا ہے جس کے رائیڈر ہوتے ہیں، اس لیے یہاں رائیڈر بننے کے لیے سائن اپ نہیں۔',
      roman: 'Yeh kaam is chat mein nahi hota. Bechne ke liye Sell page kholen aur Apply dabaen — usi se shop CityCart mein shamil hoti hai. Plumber, electrician ya salon apna form service provider apply page par bharta hai. Rider ka account woh shop ya provider banata hai jis ke rider hote hain, is liye yahan rider banne ke liye sign up nahi.',
    });
  }

  if (ASKS.total(text)) {
    return say(language, {
      en: 'CityCart’s server adds the checkout total: the prices of the items in your cart, plus the delivery fee the checkout shows, minus any discount the shop applied. Nothing changes after you press order — if the shop proposes a new amount you see it and accept or refuse it yourself.',
      ur: 'چیک آؤٹ کا کل رقم CityCart کا سرور جمع کرتا ہے: آپ کی ٹوکری میں سامان کی قیمتیں، اس پر چیک آؤٹ پر نظر آنے والی ڈیلیوری فیس، اور دکان کی لگائی ہوئی رعایت منہی۔ آرڈر دبانے کے بعد کچھ بدلتا نہیں — دکان نئی رقم تجویز کرے تو آپ کو وہ نظر آتی ہے اور قبول یا رد کرنا آپ کا اپنا فیصلہ ہے۔',
      roman: 'Checkout ka total CityCart ka server jama karta hai: aap ki cart mein items ki prices, us par checkout par dikhne wali delivery fee, aur shop ne di ho to discount minus. Order dabane ke baad kuch badalta nahi — shop nayi amount soche to aap ko wo dikhti hai aur accept ya refuse karna aap ka apna faisla hai.',
    });
  }

  if (ASKS.account(text)) {
    return say(language, {
      en: 'Those are your own account pages, and I cannot change them from here: your saved addresses are on the Addresses page, your cart on the Cart page and your orders on the Orders page, all inside your account — and you have to be signed in to place an order. An order keeps the address it was made with, so editing a saved address never moves an order that is already on its way.',
      ur: 'یہ آپ کے اپنے اکاؤنٹ کے صفحات ہیں اور میں یہاں سے ان میں تبدیلی نہیں کر سکتا: محفوظ پتے Addresses کے صفحے پر، ٹوکری Cart پر اور آرڈر Orders پر ہیں، سب آپ کے اکاؤنٹ کے اندر — اور آرڈر کرنے کے لیے سائن ان لازمی ہے۔ جو آرڈر لگ چکا ہے وہ اپنا وہی پتہ رکھے رہتا ہے، اس لیے پتہ بدلنے سے راستے میں گیا آرڈر نہیں ہلتا۔',
      roman:
        'Yeh aap ke apne account pages hain aur main yahan se in mein tabdeeli nahi kar sakta: saved addresses Addresses page par, aap ki cart Cart page par aur orders Orders page par hain, sab aap ke account ke andar — aur order karne ke liye sign in zaroori hai. Jo order lag chuka hai apna wahi address rakhe rehta hai, is liye address badalne se raste mein gaya order nahi hilta.',
    });
  }

  if (ASKS.support(text) && support.length) {
    return say(language, {
      en: `CityCart support reaches you at ${join(support)}. For an order that is already placed, ask me "where is my order?" and I will read your own orders.`,
      ur: `CityCart سپورٹ ${support.join(' اور ')} پر ملتی ہے۔ جو آرڈر پہلے سے لگا ہے، اس کے لیے مجھ سے "میرا آرڈر کہاں ہے؟" پوچھیں، میں آپ کے اپنے آرڈر دیکھتا ہوں۔`,
      roman: `CityCart support ${support.join(' aur ')} par milti hai. Jo order pehle se laga hai, us ke liye mujh se "mera order kahan hai?" poochein, main aap ke own orders dekhta hoon.`,
    });
  }

  return say(language, {
    en: 'I could not find that in CityCart’s own rules, so I will not guess it. Ask me about products near you, your own orders, a service provider or a shopping list.',
    ur: 'یہ مجھے CityCart کے اپنے قواعد میں نہیں ملا، اس لیے میں اندازہ نہیں لگاؤں گا۔ مجھ سے اپنے قریب سامان، اپنے آرڈر، سروس والے یا خریداری کی لسٹ کے بارے میں پوچھیں۔',
    roman: 'Yeh mujhe CityCart ke apne rules mein nahi mila, is liye main andaaza nahi lagaon ga. Mujh se apne qareeb saman, apne orders, service wale ya khareedari ki list ke baare mein poochein.',
  });
}

/**
 * The message carried no searchable word ("something", "help me find a thing").
 * Asking costs nothing; guessing spends a provider call and shows random shops.
 * A whole message that is only a thank you or a goodbye is the one case where
 * asking again would read as rude, so it gets its own sentence.
 */
const THANKS_ONLY =
  /^(?:thanks?\b|thank\s+you\b|thankyou\b|thx\b|shukriya\b|shukar\b|good\s*(?:bot|job|work)\b|bye\b|goodbye\b|khuda\s+hafiz\b|allah\s+hafiz\b|alvida\b|see\s+you\b|شکریہ|بشکریہ|الوداع|خدا\s?حافظ|الله\s?حافظ|ٹھیک\s?ہے|شکراً)$/iu;

function askForDetails(text) {
  if (THANKS_ONLY.test(String(text || '').trim())) {
    return say(languageOf(text), {
      en: 'You are welcome — I am here whenever you need something. Ask me for an item, your own order or a shop near you.',
      ur: 'آپ کا شکریہ — جب کچھ چاہیں میں یہاں موجود ہوں۔ مجھ سے سامان، اپنا آرڈر یا اپنے قریب دکان کے بارے میں پوچھیں۔',
      roman: 'Aap ka shukriya — jab kuch chahein main yahan mojood hoon. Mujh se item, apna order ya apne qareeb shop ke baare mein poochein.',
    });
  }
  return say(languageOf(text), {
    en: 'Tell me the item you want — “rice”, “milk”, “a gift under 3000” — and I will search the listings for it.',
    ur: 'مجھے سامان کا نام بتائیں — جیسے “چاول”، “دودھ” یا “تین ہزار تک کا تحفہ” — میں دستیاب لسٹنگ میں سے وہی تلاش کر دوں گا۔',
    roman: 'Aap mujhe item ka naam batayein — jaise “rice”, “milk” ya “3000 tak ka gift” — main maujood listings mein se wahi dhoondta hoon.',
  });
}

/** Not a marketplace question at all — say so, and say what the chat can do. */
function answerOffTopic(text) {
  return say(languageOf(text), {
    en: 'That is not something CityCart can answer — I only know about this marketplace. I can find products and shops near you, read your own orders, find a service provider and their free times, turn a dish into a shopping list, or compare two products. Ask one of those and I will use real listings, not a guess.',
    ur: 'یہ CityCart کا معاملہ نہیں، میں صرف مارکیٹ کے بارے میں جانتا ہوں۔ میں آپ کے قریب سامان اور دکانیں ڈھونڈ سکتا ہوں، آپ کے اپنے آرڈر دیکھ سکتا ہوں، سروس والا اور اس کے خالی وقت بتا سکتا ہوں، کسی پکوان کی خریداری لسٹ بنا سکتا ہوں، یا دو سامان کا موازنہ کر سکتا ہوں۔ ان میں سے کوئی سوال پوچھیں تو میں اصل لسٹنگ استعمال کروں گا، اندازہ نہیں۔',
    roman: 'Yeh CityCart ka masla nahi — main sirf marketplace ke baare mein janta hoon. Main aap ke qareeb saman aur shops dhoond sakta hoon, aap ke own orders dekh sakta hoon, service wala aur us ke free times bata sakta hoon, kisi dish ki shopping list bana sakta hoon, ya do items ka muqabla kar sakta hoon. In mein se koi sawal poochein to main real listing use karoon ga, andaaza nahi.',
  });
}

module.exports = {
  answerLocation,
  answerPolicy,
  answerOffTopic,
  askForDetails,
  languageOf,
  namedPlace,
  namedPlaceAsked,
  namedRulePlace,
  areaNamedIn,
  ASKS,
};
