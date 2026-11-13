class AiGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiGuardError';
    this.code = 'AI_BAD_OUTPUT';
  }
}

/**
 * Input and output hardening (docs/27 §6).
 *
 * User text (reviews, chat, listing notes, search boxes) is data, never an
 * instruction. Callers pass it through sanitizeUserText before it reaches a
 * prompt, and validate the model's JSON against a zod schema before using it.
 */
const MAX_MODEL_OUTPUT_CHARS = 20000;
const DEFAULT_INPUT_CHARS = 2000;

function stripTags(value) {
  return value.replace(/<[^>]*>/g, ' ');
}

function sanitizeUserText(value, maxChars = DEFAULT_INPUT_CHARS) {
  if (typeof value !== 'string') return '';
  const limit = Number(maxChars) > 0 ? Number(maxChars) : DEFAULT_INPUT_CHARS;
  return stripTags(value.replace(/\u0000/g, ''))
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, limit);
}

function extractJsonObject(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new AiGuardError('Model returned no text.');
  }
  if (text.length > MAX_MODEL_OUTPUT_CHARS) {
    throw new AiGuardError('Model output was too long.');
  }

  let body = text.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1].trim();

  // Providers sometimes wrap the object in a sentence; take the outermost
  // object and let JSON.parse reject anything malformed inside it.
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AiGuardError('Model output did not contain a JSON object.');
  }

  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AiGuardError('Model output was not valid JSON.');
  }
}

/**
 * Parses the model's JSON and returns only what the schema allows, so unknown
 * fields cannot reach business code or a response body.
 */
function parseModelJson(text, schema) {
  const value = extractJsonObject(text);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AiGuardError('Model output did not match the expected shape.');
  }
  return result.data;
}

module.exports = {
  AiGuardError,
  sanitizeUserText,
  parseModelJson,
  MAX_MODEL_OUTPUT_CHARS,
};
