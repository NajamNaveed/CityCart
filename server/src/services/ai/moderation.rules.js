const { sanitizeUserText } = require('./guard');

/**
 * On-demand moderation arithmetic (docs/29 Phase 4c).
 *
 * An administrator pastes a review, a listing or a chat line and asks CityCart
 * whether it breaks the rules. The score is decided here, in code, from fixed
 * word and pattern lists — never by the model. That is deliberate:
 *
 *   - review text is written by the public, so it is the most likely place for
 *     a prompt injection to arrive; a score the model could lower would be a
 *     score an injection could lower;
 *   - "no automatic punishment" (docs/29 Phase 4c) needs a decision a test can
 *     pin down, and a deterministic number is easier to stand behind than a
 *     sample;
 *   - the administrator still decides. This returns evidence, not an action.
 *
 * The model is only asked to word the reason a human should read. Arabic,
 * Roman Urdu and English all go through the same normalization: text is
 * lower-cased, tags are removed, and each phrase is matched on whole words so
 * "sala" inside "salad" is never evidence.
 *
 * Nothing is written, hidden, blocked or notified from here.
 */

const MAX_TEXT = 2000;

const FLAG_THRESHOLD = 60;
const REVIEW_THRESHOLD = 30;

const LABELS = {
  ABUSE: 'Insults or threats',
  SPAM: 'Advertising or spam',
  SCAM: 'Scam or private-detail request',
};

const LABEL_ORDER = ['ABUSE', 'SPAM', 'SCAM'];

const INSULTS = [
  'idiot',
  'stupid',
  'moron',
  'imbecile',
  'dumbass',
  'loser',
  'scumbag',
  'scum',
  'worthless',
  'pathetic',
  'shut up',
  'screw you',
  'fuck you',
  'fuck off',
  'bullshit',
  'bastard',
  'bitch',
  'asshole',
  'dickhead',
  'motherfucker',
  'whore',
  'slut',
  'retard',
  'cunt',
  'harami',
  'haramzada',
  'haramzadi',
  'kamina',
  'kaminay',
  'kutta',
  'kuttay',
  'kutiya',
  'saala',
  'bakwas',
];

// The words that on their own justify a flag, without a second hit.
const SLURS = ['bhenchod', 'behnchod', 'madarchod', 'chutiya', 'chutya', 'gandu', 'gashti', 'randi'];

const THREATS = [
  'kill you',
  'i will kill',
  "i'll kill",
  'will kill you',
  'beat you',
  'i will beat',
  "i'll beat",
  'i will hurt you',
  "i'll hurt you",
  'i will find you',
  'destroy you',
  'jaan se mar',
  'maar dunga',
  'mar dunga',
  'dekh lunga',
  'teri maa',
  'teri behen',
];

const SPAM_PHRASES = [
  'buy now',
  'click here',
  'limited offer',
  'special offer',
  'discount code',
  'promo code',
  'free gift',
  'buy 1 get 1',
  'dm me',
  'inbox me',
  'visit my',
  'subscribe to my',
  'follow my page',
  'instagram',
  'facebook page',
  'tiktok',
  'earn money',
  'work from home',
  'whatsapp me',
  'message me on whatsapp',
];

const SCAM_PHRASES = [
  'send money',
  'bank transfer',
  'advance payment',
  'pay first',
  'western union',
  'easypaisa',
  'easy paisa',
  'jazzcash',
  'lottery',
  'prize money',
  'claim your prize',
  'you have won',
  'otp',
  'one time password',
  'password',
  'cnic',
  'card number',
  'atm pin',
  'pin code',
  'security code',
  'bank account',
  'account number',
  'verify your account',
  'share your account',
  'contact me on',
  'call me on',
];

const WEIGHT = {
  INSULT: 30,
  SLUR: 60,
  THREAT: 65,
  SPAM: 25,
  SCAM: 35,
  URL: 20,
  EMAIL: 15,
  PHONE: 25,
};

const URL_PATTERN = /https?:\/\/|www\./gi;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;
// A Pakistani mobile number, written with or without +92 and separators.
const PHONE_PATTERN = /\b(?:\+?92[\s-]?|0)?3\d{2}[\s-]?\d{7}\b/g;

function escapeTerm(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

// Whole words only: "saala" is evidence, "salad" and "salable" are not.
function phrasePattern(term) {
  return new RegExp(`(?:^|[^a-z0-9])${escapeTerm(term)}(?:s|es)?(?![a-z0-9])`, 'i');
}

const RULES = [
  ...INSULTS.map((term) => ({ label: 'ABUSE', weight: WEIGHT.INSULT, term, pattern: phrasePattern(term) })),
  ...SLURS.map((term) => ({ label: 'ABUSE', weight: WEIGHT.SLUR, term, pattern: phrasePattern(term) })),
  ...THREATS.map((term) => ({ label: 'ABUSE', weight: WEIGHT.THREAT, term, pattern: phrasePattern(term) })),
  ...SPAM_PHRASES.map((term) => ({ label: 'SPAM', weight: WEIGHT.SPAM, term, pattern: phrasePattern(term) })),
  ...SCAM_PHRASES.map((term) => ({ label: 'SCAM', weight: WEIGHT.SCAM, term, pattern: phrasePattern(term) })),
];

function countOf(pattern, text, cap = Infinity) {
  const matches = text.match(pattern);
  return Math.min(matches ? matches.length : 0, cap);
}

function verdictOf(score) {
  if (score >= FLAG_THRESHOLD) return 'FLAGGED';
  if (score >= REVIEW_THRESHOLD) return 'REVIEW';
  return 'CLEAR';
}

/**
 * The server's own score and labels for one piece of text. The sum is capped
 * at 100; labels are the categories that contributed anything, in a fixed
 * order, so the same text always produces the same answer.
 */
function inspectText(value) {
  const text = sanitizeUserText(typeof value === 'string' ? value : '', MAX_TEXT).toLowerCase();
  const points = { ABUSE: 0, SPAM: 0, SCAM: 0 };

  for (const rule of RULES) {
    if (rule.pattern.test(text)) points[rule.label] += rule.weight;
  }
  // Contact details are spam on their own; a "call me on …" phrase also earns
  // the scam weight, because the two together are how the classic pattern
  // reads.
  points.SPAM += countOf(URL_PATTERN, text, 2) * WEIGHT.URL;
  points.SPAM += countOf(EMAIL_PATTERN, text, 1) * WEIGHT.EMAIL;
  points.SPAM += countOf(PHONE_PATTERN, text, 2) * WEIGHT.PHONE;

  const score = Math.min(100, points.ABUSE + points.SPAM + points.SCAM);
  const labels = LABEL_ORDER.filter((label) => points[label] > 0);
  return { text, score, labels, verdict: verdictOf(score), points };
}

const REASON_BY_LABEL = {
  ABUSE: "CityCart's checks found insulting or threatening wording.",
  SPAM: "CityCart's checks found advertising or promotional wording.",
  SCAM: "CityCart's checks found wording often used in payment scams or requests for private details.",
};

function rulesReason(labels) {
  if (!labels || labels.length === 0) {
    return "CityCart's checks found no abuse, spam or scam wording in this text.";
  }
  return labels.map((label) => REASON_BY_LABEL[label]).join(' ');
}

const ACTION_CLAIM =
  /(?:has been|have been|was|is now|will be)\s+(?:removed|deleted|hidden|blocked|banned|suspended|flagged)/i;
const CONTACT_IN_REASON = /(?:https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b)/i;

/**
 * A reason may not link out and may not claim an action the platform has not
 * taken. Anything that does gets the rules wording instead, so the admin never
 * reads "this review has been removed" from a text-only check.
 */
function cleanReason(value, fallback) {
  const text = sanitizeUserText(typeof value === 'string' ? value : '', 280)
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 10) return fallback;
  if (CONTACT_IN_REASON.test(text) || ACTION_CLAIM.test(text)) return fallback;
  return text;
}

module.exports = {
  MAX_TEXT,
  FLAG_THRESHOLD,
  REVIEW_THRESHOLD,
  LABELS,
  LABEL_ORDER,
  WEIGHT,
  inspectText,
  verdictOf,
  rulesReason,
  cleanReason,
};
