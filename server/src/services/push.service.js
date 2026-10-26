const DeviceToken = require('../models/deviceToken.model');
const env = require('../config/env');

/**
 * Push notifications through Expo's push service (docs/12 §31). It uses Node's built-in
 * fetch, so it needs no package. It is OFF unless PUSH_ENABLED=true, it is best-effort (a
 * failure is logged and never reaches the request that caused the notification), and it
 * mirrors the in-app notification: the same title and text, plus ids to open the right screen.
 */
const PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100; // Expo accepts up to 100 messages per request
const TIMEOUT_MS = 8000;

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

async function sendChunk(messages) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (env.push.accessToken) headers.Authorization = `Bearer ${env.push.accessToken}`;
  const res = await fetch(PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`push service answered ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

/**
 * Sends one notification to every registered phone of these users. A phone that Expo says is no
 * longer registered is forgotten, so dead tokens do not pile up. Returns how many were sent.
 */
async function sendPushToUsers(userIds, { title, body, data }) {
  if (!env.push.enabled) return 0;
  try {
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return 0;
    const devices = await DeviceToken.find({ userId: { $in: ids } }).select('token');
    if (devices.length === 0) return 0;

    const messages = devices.map((d) => ({ to: d.token, title, body, data: data || {}, sound: 'default', channelId: 'default', priority: 'high' }));
    let sent = 0;
    for (const group of chunks(messages, CHUNK)) {
      const tickets = await sendChunk(group);
      const dead = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') sent += 1;
        else if (ticket.details && ticket.details.error === 'DeviceNotRegistered') dead.push(group[i].to);
      });
      if (dead.length) await DeviceToken.deleteMany({ token: { $in: dead } });
    }
    return sent;
  } catch (err) {
    console.error(`[push] could not send: ${err.message}`);
    return 0;
  }
}

module.exports = { sendPushToUsers, PUSH_URL, CHUNK };
