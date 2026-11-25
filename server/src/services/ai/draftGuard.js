const { isGrounded } = require('./ground');

/**
 * The last check on a drafted shop reply (docs/29 Phase 2i).
 *
 * A draft is different from any other AI text in this codebase: the shop reads
 * it, presses "use", and the words become a promise to a real customer. So the
 * drafter is not allowed to be merely plausible. Three things refuse a draft,
 * each replaced by a line the server wrote from the records it read:
 *
 *   1. a money-or-parcel promise the platform cannot back (a refund, a
 *      replacement, a re-delivery, a discount, a coupon, a delivery fee);
 *   2. any figure the read facts do not contain — including a bare stock count,
 *      which CityCart never publishes to customers;
 *   3. nothing at all when CityCart holds no record for the question, which is
 *      said to the shop plainly instead of dressed up as a reply.
 *
 * What is said instead is only ever what was read: the listing's own price, its
 * stock state, the shop's published timeframe, the areas its branches are in,
 * the customer's own order or return state, and the platform rules already
 * stated to shoppers in the chat (facts.js).
 */

const say = (language, forms) => forms[language] || forms.en;

// A first- or second-person commitment about money or a parcel. The customer's
// own order state is data and stays allowed ("your order was cancelled" reads
// from the record); "we will refund you" reads from nowhere.
const ACTION_CLAIMS = [
  /\b(?:we|i|this shop|shop)\b[^.!?]{0,24}\b(?:will|shall|would|can|are|have|had|ve)\s*(?:'?l)?\b[^.!?]{0,16}\b(?:refund|reimburs|credit|pay\s+back|return\s+your\s+money|send\s+(?:you\s+)?(?:a|another|one|new)|resend|re-?send|re-?deliver|replace|dispatch|ship\s+again|cancel\w*|waive|discount|compensat|adjust)\b/iu,
  /\b(?:refund|replacement|re-?delivery|resend)\b[^.!?]{0,20}\b(?:will|is\s+being|has\s+been|already|done|issued|processed|arranged|on\s+its\s+way|coming|sent)\b/iu,
  /\b(?:we|shop)\b[^.!?]{0,18}\b(?:refunded|reimbursed|credited|cancelled|canceled|replaced|reshipped|dispatched)\b/iu,
  /\byour\s+money\s+back\b/iu,
  // Roman Urdu: "paise wapas kar denge", "refund ho jayega", "dubara bhej denge".
  /\b(?:paise|paisa|payment|refund|raqam)\b[^.!?]{0,20}\b(?:wapas|waps|de\s*denge|kar\s+denge|ho\s+(?:jayega|gaya|diya)|milega)\b/iu,
  /\b(?:dubara|doobara|dbara)\b[^.!?]{0,18}\b(?:bhej|send|deliver|kar)\w*\b/iu,
  // Roman Urdu does the same thing in two words — "order cancel kar diya",
  // "replacement bhej denge" — where no English auxiliary ever appears.
  /\b(?:cancel|cancelled|replacement|replace)\b[^.!?]{0,14}\b(?:kar\s*(?:diya|denge|dunga|deta|deti|rahay|hain|ha|do|dega)|ho\s*(?:gaya|gai|jayega|raha|ha|diya))\b/iu,
  // Urdu script: پیسے واپس / رقم لوٹا / دوبارہ بھیج / بدل کر دیں گے
  /پیسے\s?واپس|رقم\s?لوٹا|دوبارہ\s?بھیج|بدل\s?کر\s?دیں|ری\s?فنڈ\s?کر/u,
];

// CityCart enforces none of these, so no draft may state them: checkout adds no
// delivery fee and no minimum order (order.service.js) and there is no coupon,
// promo or voucher code anywhere in the platform.
const UNENFORCED_MONEY = [
  /\b(?:free|no|without)\s+delivery\b/iu,
  // "delivery is free" and "delivery charge waived" say the same thing from the
  // other end of the sentence, and a shop can promise it just as easily.
  /\bdelivery\b[^.!?]{0,16}\b(?:is|are|will|shall|be)\s*(?:free|no\s+charge|without\s+charge|at\s+no\s+cost|zero)\b/iu,
  /\b(?:delivery|shipping)\b[^.!?]{0,16}\b(?:fee|charge|charges|cost)\b/iu,
  /\b(?:fee|charge|charges|cost)\b[^.!?]{0,16}\bdelivery\b/iu,
  /\bminimum\b[^.!?]{0,16}\b(?:order|amount|purchase|bill)\b/iu,
  /\b(?:coupon|coupons|promo|promotion|promotional|voucher|discount\s+code|promo\s+code)\b/iu,
  /\b(?:discount|off)\b[^.!?]{0,12}\b(?:code|coupon|voucher|promo)\b/iu,
  /ڈیلیوری\s?(?:چارج|فیس)|کوپن|واؤچر|ڈسکاؤنٹ\s?کوڈ|مفت\s?ڈیلیوری/u,
];

const makesActionClaim = (text) => ACTION_CLAIMS.some((pattern) => pattern.test(String(text || '')));

const promisesUnenforcedMoney = (text) => UNENFORCED_MONEY.some((pattern) => pattern.test(String(text || '')));

/**
 * Why a draft was refused. `numbers` lists the figures the records never said,
 * so the shop can be told what went wrong instead of being handed a silent
 * rewrite.
 */
function checkDraft({ draft, facts }) {
  const text = String(draft || '').trim();
  if (!text) return { ok: false, reasons: ['empty'] };
  const reasons = [];
  if (makesActionClaim(text)) reasons.push('action');
  if (promisesUnenforcedMoney(text)) reasons.push('money');
  const verdict = isGrounded(text, facts || {}, { counts: true });
  if (!verdict.ok) reasons.push('numbers');
  return { ok: reasons.length === 0, reasons, missing: verdict.missing };
}

const STOCK_LINES = {
  IN_STOCK: {
    en: (name) => `Yes, ${name} is in stock — you can order it from our listing.`,
    ur: (name) => `جی ہاں، ${name} ہمارے پاس دستیاب ہے۔ آپ اسے لسٹنگ سے آرڈر کر سکتے ہیں۔`,
    roman: (name) => `Ji haan, ${name} hamare paas stock mein hai — aap isay listing se order kar saktay hain.`,
  },
  LOW_STOCK: {
    en: (name) => `${name} is in stock but running low, so order it soon.`,
    ur: (name) => `${name} دستیاب ہے مگر تھوڑا سا رہ گیا ہے، جلدی آرڈر کریں۔`,
    roman: (name) => `${name} stock mein hai magar thora sa reh gaya hai, jaldi order karein.`,
  },
  OUT_OF_STOCK: {
    en: (name) => `${name} is out of stock right now.`,
    ur: (name) => `${name} فی الحال ہمارے پاس ختم ہے۔`,
    roman: (name) => `${name} filhal hamare paas khatam hai.`,
  },
  NOT_TRACKED: {
    en: (name) => `${name} is on our listing and you can order it now.`,
    ur: (name) => `${name} ہماری لسٹنگ پر ہے، آپ ابھی آرڈر کر سکتے ہیں۔`,
    roman: (name) => `${name} hamari listing par hai, aap abhi order kar saktay hain.`,
  },
};

const RETURN_STATE = {
  IN_TRANSIT: {
    en: 'The return is on its way back to us.',
    ur: 'واپسی کا سامان ہماری طرف آ رہا ہے۔',
    roman: 'Return ka saman hamari taraf aa raha hai.',
  },
  RECEIVED: {
    en: 'We have the returned items with us.',
    ur: 'واپس کیا سامان ہمیں مل گیا ہے۔',
    roman: 'Wapas kiya saman humein mil gaya hai.',
  },
};

/** The rule lines the platform can stand behind — the same facts the shopper
 *  chat is given (facts.js), in the shop's own voice. */
const RULE_LINES = {
  fee: {
    en: 'CityCart adds no delivery fee to your bill — you pay the item prices on the listing.',
    ur: 'CityCart آپ کے بل میں ڈیلیوری چارج شامل نہیں کرتا — آپ لسٹنگ پر لکھی قیمت ادا کرتے ہیں۔',
    roman: 'CityCart aap ke bill mein delivery fee add nahi karta — aap listing par likhi price pay karte hain.',
  },
  minimum: {
    en: 'There is no minimum order amount on CityCart.',
    ur: 'CityCart پر کم از کم آرڈر کی کوئی شرط نہیں۔',
    roman: 'CityCart par minimum order ki koi shart nahi.',
  },
  payment: {
    en: 'You pay in cash when the order reaches you — CityCart takes payment at the door.',
    ur: 'آرڈر آپ تک پہنچنے پر آپ کیش ادا کرتے ہیں — CityCart دروازے پر ادائیگی لیتا ہے۔',
    roman: 'Order aap tak pohanchne par aap cash pay karte hain — CityCart darwaze par payment leta hai.',
  },
  receipt: {
    en: 'The receipt for a paid order is on that order’s own page; CityCart does not write an invoice on request.',
    ur: 'ادائیگی شدہ آرڈر کی رسید اسی آرڈر کے صفحے پر ہوتی ہے؛ CityCart درخواست پر انوائس نہیں بناتا۔',
    roman: 'Paid order ki receipt usi order ke page par hoti hai; CityCart request par invoice nahi banata.',
  },
  coupon: {
    en: 'CityCart has no coupon or promo codes — a price change can only come from the shop’s listing.',
    ur: 'CityCart پر کوئی کوپن یا پرومو کوڈ نہیں — قیمت کی تبدیلی صرف دکان کی لسٹنگ سے آتی ہے۔',
    roman: 'CityCart par koi coupon ya promo code nahi — price ki tabdeeli sirf shop ki listing se aati hai.',
  },
};

const ORDER_STATE_WORDS = {
  PENDING: { en: 'is waiting for the shop to confirm', ur: 'دکان کی تصدیق کا منتظر ہے', roman: 'shop ki confirmation ka wait kar raha hai' },
  CONFIRMED: { en: 'is confirmed', ur: 'تصدیق ہو چکا ہے', roman: 'confirm ho chuka hai' },
  PROCESSING: { en: 'is being packed', ur: 'پیک ہونے میں ہے', roman: 'pack ho raha hai' },
  READY_FOR_SHIPMENT: { en: 'is packed and waiting for a rider', ur: 'پیک ہو کر رائیڈر کا منتظر ہے', roman: 'pack ho gaya hai, rider ka wait kar raha hai' },
  SHIPPED: { en: 'has left the shop', ur: 'دکان سے نکل چکا ہے', roman: 'shop se nikal chuka hai' },
  OUT_FOR_DELIVERY: { en: 'is on its way with a rider', ur: 'رائیڈر کے ساتھ آپ کی طرف جا رہا ہے', roman: 'rider ke saath aap ki taraf ja raha hai' },
  DELIVERED: { en: 'was delivered', ur: 'پہنچا دیا گیا', roman: 'deliver kar diya gaya' },
  CANCELLED: { en: 'was cancelled', ur: 'منسوخ ہو گیا', roman: 'cancel ho gaya' },
  REJECTED: { en: 'was not accepted by the shop', ur: 'دکان نے منظور نہیں کیا', roman: 'shop ne accept nahi kiya' },
  RETURN_REQUESTED: { en: 'has a return requested', ur: 'اس کی واپسی کی درخواست ہے', roman: 'is ki return request hai' },
  RETURNED: { en: 'came back to the shop', ur: 'دکان واپس آ گیا', roman: 'shop wapas aa gaya' },
  REFUNDED: { en: 'was settled as refunded', ur: 'ری فنڈ کے طور پر طے ہو گیا', roman: 'refund ke taur par set ho gaya' },
};

/**
 * The line the shop gets when the model's words cannot be trusted, or when no
 * model is needed at all. It states only what `readChatFacts` returned, so it
 * cannot be wrong about this shop, and it never offers an action CityCart has
 * not taken.
 */
function serverDraft({ family, facts, language }) {
  const f = facts || {};
  const l = language === 'ur' || language === 'roman' ? language : 'en';

  if (f.candidates) {
    const names = f.candidates.length ? f.candidates.join(', ') : null;
    return say(l, {
      en: names
        ? `Which item do you mean — ${names}? Tell us the name and we can answer exactly.`
        : 'Tell us which item you mean by name, and we can answer exactly.',
      ur: names
        ? `آپ کس چیز کی بات کر رہے ہیں — ${names}؟ نام بتائیں تو صحیح جواب دے سکتے ہیں۔`
        : 'نام بتائیں کہ آپ کس چیز کی بات کر رہے ہیں، پھر صحیح جواب دے سکتے ہیں۔',
      roman: names
        ? `Aap kis item ki baat kar rahay hain — ${names}? Naam batayein to theek jawab de saktay hain.`
        : 'Naam batayein ke aap kis item ki baat kar rahay hain, phir theek jawab de saktay hain.',
    });
  }

  if (family === 'availability') {
    const lines = STOCK_LINES[f.stockState] || STOCK_LINES.NOT_TRACKED;
    return lines[l](f.productName);
  }

  if (family === 'price') {
    const was = f.compareAtPrice && f.compareAtPrice > f.price ? ` It was listed at Rs ${f.compareAtPrice}.` : '';
    return say(l, {
      en: `${f.productName} is Rs ${f.price} on our listing.${was}`,
      ur: `${f.productName} ہماری لسٹنگ پر ${f.price} روپے ہے۔${f.compareAtPrice && f.compareAtPrice > f.price ? ` پہلے اس کی قیمت ${f.compareAtPrice} روپے لکھی تھی۔` : ''}`,
      roman: `${f.productName} hamari listing par Rs ${f.price} hai.${was}`,
    });
  }

  if (family === 'detail') {
    const listed = (f.details || []).map((entry) => `${entry.key}: ${entry.value}`).join(', ');
    return say(l, {
      en: `${f.productName} — ${listed}. The listing shows the same details.`,
      ur: `${f.productName} — ${listed}. یہ تفصیل لسٹنگ پر بھی لکھی ہے۔`,
      roman: `${f.productName} — ${listed}. Yeh detail listing par bhi likhi hai.`,
    });
  }

  if (family === 'coverage') {
    const zones = (f.zones || []).join(', ');
    if (f.zoneAsked) {
      return f.coversZone
        ? say(l, {
            en: `Yes, we deliver to ${f.zoneAsked}.`,
            ur: `جی ہاں، ہم ${f.zoneAsked} میں ڈیلیوری کرتے ہیں۔`,
            roman: `Ji haan, hum ${f.zoneAsked} mein delivery karte hain.`,
          })
        : say(l, {
            en: `We do not deliver to ${f.zoneAsked}. Our areas are ${zones}.`,
            ur: `ہم ${f.zoneAsked} میں ڈیلیوری نہیں کرتے۔ ہمارے علاقے ${zones} ہیں۔`,
            roman: `Hum ${f.zoneAsked} mein delivery nahi karte. Hamare areas ${zones} hain.`,
          });
    }
    return say(l, {
      en: `We deliver in ${zones}.`,
      ur: `ہم ${zones} میں ڈیلیوری کرتے ہیں۔`,
      roman: `Hum ${zones} mein delivery karte hain.`,
    });
  }

  if (family === 'timing') {
    return say(l, {
      en: `Our published delivery time is ${f.promise}.`,
      ur: `ہمارا لکھا ڈیلیوری وقت ${f.promise} ہے۔`,
      roman: `Hamara published delivery time ${f.promise} hai.`,
    });
  }

  if (family === 'order') {
    if (!f.orderState) {
      return say(l, {
        en: 'We cannot find an order from you with us yet.',
        ur: 'ہمیں آپ کی طرف سے ابھی کوئی آرڈر نہیں مل سکا۔',
        roman: 'Humein aap ki taraf se abhi koi order nahi mila.',
      });
    }
    const words = ORDER_STATE_WORDS[f.orderState] || { en: `is ${String(f.orderState).toLowerCase()}`, ur: 'کی حالت لسٹنگ پر ہے', roman: `is ${String(f.orderState).toLowerCase()}` };
    const items = f.itemCount ? ` (${f.itemCount} items)` : '';
    return say(l, {
      en: `Your order ${words.en}${items}.`,
      ur: `آپ کا آرڈر ${words.ur}${f.itemCount ? ` (${f.itemCount} اشیاء)` : ''}۔`,
      roman: `Aap ka order ${words.roman}${items}.`,
    });
  }

  if (family === 'return') {
    if (!f.returnState) {
      return say(l, {
        en: 'There is no return raised on your order with us.',
        ur: 'آپ کے آرڈر پر ہماری طرف سے کوئی واپسی درج نہیں۔',
        roman: 'Aap ke order par hamari taraf se koi return darj nahi.',
      });
    }
    const state = RETURN_STATE[f.returnState] || RETURN_STATE.IN_TRANSIT;
    const money = !f.refundAmount
      ? say(l, {
          en: ' It was cash on delivery, so nothing was collected at the door and there is no money to send back.',
          ur: ' یہ کیش آن ڈیلیوری آرڈر تھا، دروازے پر رقم جمع نہیں ہوئی، واپس بھیجنے کے لیے کچھ نہیں۔',
          roman: ' Yeh cash on delivery order tha, darwaze par kuch collect nahi hua, is liye wapas bhejne ko kuch nahi.',
        })
      : '';
    return `${state[l] || state.en}${money}`;
  }

  if (family === 'complaint') {
    return say(l, {
      en: 'We are sorry. Tell us which item and what was wrong, and if it has not arrived you can refuse it at the door.',
      ur: 'افسوس ہے۔ بتائیں کون سی چیز اور کیا مسئلہ تھا، اور اگر سامان نہیں پہنچا تو آپ دروازے پر ہی واپس کر سکتے ہیں۔',
      roman: 'Sorry. Batayein kaunsi cheez aur kya masla tha, aur agar saman nahi pohancha to aap darwaze par hi wapas kar saktay hain.',
    });
  }

  if (family === 'rule' && RULE_LINES[f.rule]) return RULE_LINES[f.rule][l] || RULE_LINES[f.rule].en;

  // The review half has no records to read beyond the rating itself, so its
  // fallback is thanks, which cannot be wrong.
  if (family === 'review') {
    const rating = Number(f.rating) || 0;
    const lines = rating > 0 && rating <= 2 ? REVIEW_LINES.low : REVIEW_LINES.good;
    return lines[l] || lines.en;
  }

  return ACKNOWLEDGE_LINES[l] || ACKNOWLEDGE_LINES.en;
}

/**
 * What the shop gets when CityCart holds no record to answer from. It promises
 * no outcome, states no figure and says nothing about the order, the money or
 * the stock, so it is safe for a thread the platform knows nothing about.
 */
const ACKNOWLEDGE_LINES = {
  en: 'Thank you for writing to us. We have read your message.',
  ur: 'ہمیں پیغام بھیجنے کا شکریہ۔ ہم نے آپ کا پیغام پڑھ لیا ہے۔',
  roman: 'Hamein message bhejne ka shukriya. Hum ne aap ka message parh liya hai.',
};

/** The same shape for a review: thanks and nothing promised. */
const REVIEW_LINES = {
  low: {
    en: 'Thank you for telling us where we fell short. We are sorry.',
    ur: 'ہمیں بتانے کا شکریہ کہ کہاں کمی رہی۔ ہمیں افسوس ہے۔',
    roman: 'Hamein batane ka shukriya ke kahan kami rahi. Humein afsos hai.',
  },
  good: {
    en: 'Thank you for the review. We are glad you chose us.',
    ur: 'آپ کے جائزے کا شکریہ۔ خوشی ہے کہ آپ نے ہمیں چنا۔',
    roman: 'Aap ke review ka shukriya. Khushi hai ke aap ne hamein chuna.',
  },
};

/** What the shop is told when CityCart simply has no record that answers. */
const DECLINED_LINES = {
  NO_HOURS_DATA:
    'CityCart stores no opening hours or open days for a shop, so only you can answer this.',
  NO_CONTACT_DRAFT:
    'CityCart does not draft contact details. Your own phone and e-mail are on your shop page under Contact.',
  NO_DETAIL_DATA:
    'This listing has no recorded detail for that, and CityCart has no size or variant data — only you can answer it.',
  NO_AUTHENTICITY_PROOF:
    'CityCart holds no record that proves an item is original, so only you can answer this. Do not claim authenticity you cannot show.',
  NO_PUBLISHED_PROMISE:
    'You have not published a delivery timeframe, so there is nothing to quote. Add it under Shop → Settings to get a drafted answer.',
  NO_BRANCH_ZONES:
    'CityCart does not know which areas your shop delivers to because no branch is set. Add your branch areas under Shop → Branches.',
  NO_LISTING_MATCH:
    'CityCart could not tell which of your listings the customer means. Name the item in your own reply.',
  NO_ORDER:
    'This conversation is not tied to a customer account, so CityCart cannot read an order for it.',
};

module.exports = {
  ACTION_CLAIMS,
  UNENFORCED_MONEY,
  makesActionClaim,
  promisesUnenforcedMoney,
  checkDraft,
  serverDraft,
  DECLINED_LINES,
  ACKNOWLEDGE_LINES,
  REVIEW_LINES,
  STOCK_LINES,
  RULE_LINES,
  ORDER_STATE_WORDS,
};
