/**
 * Cleans a chat message before it is stored. The client renders messages as
 * plain text (React escapes them), so this is defence in depth and about
 * keeping the conversation readable:
 *  - control characters are dropped (they break layouts and logs);
 *  - Unicode direction overrides are dropped (they let text visually spoof
 *    other text, e.g. make a link look different from where it goes);
 *  - runs of blank lines are collapsed.
 * Newlines and normal punctuation, including Urdu and emoji, are kept.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;

function cleanMessageBody(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(BIDI_OVERRIDES, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { cleanMessageBody };
