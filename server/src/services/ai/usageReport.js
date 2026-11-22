const AiUsage = require('../../models/aiUsage.model');

/**
 * The per-agent cost and fallback report (docs/29 Phase 7b). It reads only the
 * accounting columns of `AiUsage` — never a prompt or a reply — and turns them
 * into request, fallback, retry and token figures for the admin analytics page.
 *
 * A row with `ok: false` is a request whose providers all failed; the agent
 * then answered with its deterministic text, so `failed` is the fallback
 * count a shop or the platform actually paid for.
 */

// One range is read in a single pass. Older rows beyond this cap are ignored
// rather than letting an accidental full-history read take the process down.
const MAX_ROWS = 20000;

function rate(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function newBucket(agent) {
  return {
    agent,
    requests: 0,
    ok: 0,
    failed: 0,
    retried: 0,
    promptTokens: 0,
    completionTokens: 0,
    ms: 0,
    users: new Set(),
    lastError: null,
  };
}

function addRow(bucket, row) {
  bucket.requests += 1;
  if (row.ok) {
    bucket.ok += 1;
  } else {
    bucket.failed += 1;
    // Rows arrive newest first, so the first error kept is the latest one.
    if (row.error && !bucket.lastError) bucket.lastError = String(row.error).slice(0, 300);
  }
  if (Number(row.attempts) > 1) bucket.retried += 1;
  bucket.promptTokens += Number(row.promptTokens) || 0;
  bucket.completionTokens += Number(row.completionTokens) || 0;
  bucket.ms += Number(row.ms) || 0;
  if (row.userId) bucket.users.add(String(row.userId));
}

function finish({ agent, ...bucket }) {
  const totalTokens = bucket.promptTokens + bucket.completionTokens;
  return {
    ...bucket,
    agent,
    totalTokens,
    successRate: rate(bucket.ok, bucket.requests),
    fallbackRate: rate(bucket.failed, bucket.requests),
    retryRate: rate(bucket.retried, bucket.requests),
    avgMs: bucket.requests ? Math.round(bucket.ms / bucket.requests) : 0,
  };
}

/**
 * Pure aggregation over lean `AiUsage` rows. `totals` counts every request
 * once; `agents` is ordered by volume so the busiest (most expensive) agent is
 * visible first.
 */
function summarizeUsage(rows = []) {
  const byAgent = new Map();
  const all = newBucket(null);

  for (const row of rows) {
    const agent = typeof row.agent === 'string' && row.agent.trim() ? row.agent.trim() : 'unknown';
    if (!byAgent.has(agent)) byAgent.set(agent, newBucket(agent));
    addRow(byAgent.get(agent), row);
    addRow(all, row);
  }

  const agents = [...byAgent.values()]
    .map((bucket) => ({ ...finish(bucket), users: bucket.users.size }))
    .sort((a, b) => b.requests - a.requests || a.agent.localeCompare(b.agent));

  const totals = { ...finish(all), users: all.users.size };
  return { totals, agents };
}

async function getUsageReport({ range }) {
  const rows = await AiUsage.find({ createdAt: { $gte: range.from, $lt: range.to } })
    .select('agent userId ok attempts promptTokens completionTokens ms error')
    .sort({ createdAt: -1 })
    .limit(MAX_ROWS)
    .lean();

  return {
    labels: range.labels,
    truncated: rows.length >= MAX_ROWS,
    ...summarizeUsage(rows),
  };
}

module.exports = { summarizeUsage, getUsageReport, MAX_ROWS };
