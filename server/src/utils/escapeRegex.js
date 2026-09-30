/**
 * Escapes regex metacharacters so user input can be used as a LITERAL
 * substring inside a MongoDB $regex. Without this, a crafted `search`
 * value (e.g. "(a+)+$") is interpreted as a pattern and can hang the
 * query (ReDoS) or match unintended documents.
 */
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
