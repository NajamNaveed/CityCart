const env = require('./env');

// CLIENT_URL may list several addresses separated by commas.
const configuredOrigins = env.clientUrl
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// While developing, any localhost port is fine: Vite quietly moves to 5174, 5175...
// when 5173 is busy, and localhost / 127.0.0.1 are different origins to a browser.
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function isAllowedOrigin(origin, { nodeEnv = env.nodeEnv, allowed = configuredOrigins } = {}) {
  if (allowed.includes(origin)) return true;
  return nodeEnv !== 'production' && LOCAL_DEV_ORIGIN.test(origin);
}

const corsOptions = {
  // Requests without an Origin (curl, Postman, server-to-server) are not browser cross-site requests.
  origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
  credentials: true,
};

module.exports = { corsOptions, isAllowedOrigin };