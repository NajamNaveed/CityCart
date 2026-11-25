/**
 * What is there to search for? (shared by the shop agent and the router)
 *
 * Two decisions depend on the same question — the plain fallback search needs
 * the words to look up, and the router needs to know whether a message that
 * mentions "my area" is really about the area or about an item in it. Keeping
 * one word list means the two can never disagree: "cheapest milk in my area"
 * searches for milk, and "what is my location" has nothing to search, so the
 * chat answers it from the shopper's own saved place.
 */
const FALLBACK_TOKENS = 6;

// Words that carry no product meaning in a plain fallback search: polite
// filler, money words, and the names of the surroundings themselves.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'best', 'buy', 'can', 'cheap', 'cheapest', 'find', 'for', 'from', 'get', 'give',
  'good', 'have', 'how', 'i', 'in', 'is', 'it', 'less', 'me', 'my', 'near', 'need', 'of', 'on', 'or', 'please',
  'rs', 'rupees', 'show', 'some', 'than', 'the', 'to', 'under', 'want', 'what', 'where', 'which', 'with', 'you',
  'all', 'another', 'available', 'availability', 'else', 'more', 'most', 'other', 'that', 'then', 'these',
  'this', 'those', 'top', 'well',
  'nearby', 'close', 'around', 'here', 'there', 'list', 'lists', 'shop', 'shops', 'store', 'stores', 'market',
  'markets', 'area', 'areas', 'zone', 'zones', 'block', 'blocks', 'locality', 'localities', 'location',
  'address', 'deliver', 'delivery', 'delivers', 'city', 'order', 'orders', 'price', 'prices', 'cost', 'costs',
  'sell', 'sells', 'sold', 'seller', 'street', 'road', 'colony', 'phase',
  // Rules, distances and times: none of them is the name of an item, and a
  // message made only of these is a question the server answers from its data.
  'amount', 'away', 'cancel', 'charge', 'charges', 'closest', 'cod', 'covered', 'distance', 'far', 'farther',
  'farthest', 'fee', 'fees', 'latest', 'maximum', 'minimum', 'nearest', 'now', 'open', 'opened', 'opening',
  'closed', 'hours', 'timing', 'timings', 'time', 'paid', 'pay', 'payment', 'payments', 'policy', 'policies',
  'recent', 'refund', 'refunds', 'return', 'returns', 'rider', 'riders', 'status', 'track', 'tracking',
  'kab', 'tak', 'aayega', 'ayega', 'aaega', 'aayegi', 'ayegi', 'hoga', 'hogi', 'khula', 'khuli', 'khulta',
  'band',
  'kitna', 'kitni', 'kitne', 'kya', 'hai', 'hain', 'tha', 'thi', 'mera', 'meri', 'meray', 'apna', 'apni', 'aap',
  'tum', 'ilaka', 'elaka', 'kahan', 'kahaa', 'kaunsa', 'kaunsi', 'konsa', 'konsi', 'bata', 'batao', 'dikha',
  'dikhao', 'chahiye', 'chahta', 'chahti',
  'chahun', 'chahein', 'kar', 'karo', 'karein', 'karta', 'karti', 'doon', 'dena', 'lena', 'lein', 'liye', 'wala',
  'wale',
  // Being polite is not buying. Left searchable, “thanks” searched the whole
  // catalogue for the word and answered a thank you with a bag of rice.
  'thanks', 'thank', 'thanksly', 'thx', 'bye', 'goodbye', 'welcome', 'alright', 'bot', 'khuda', 'hafiz',
  'alvida', 'shukriya', 'shukar', 'shukria', 'theek',
  'شکریہ', 'بشکریہ', 'الوداع', 'حافظ', 'خدا', 'شکراً',
]);

/** The message split into usable search words, longest first. */
function fallbackQueries(text) {
  const words = String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, FALLBACK_TOKENS);
}

module.exports = { fallbackQueries, STOPWORDS, FALLBACK_TOKENS };
