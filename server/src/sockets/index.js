const { Server } = require('socket.io');

const { isAllowedOrigin } = require('../config/cors');
const { AUTH_COOKIE_NAME } = require('../config/cookie');
const { verifyToken } = require('../utils/jwt');
const User = require('../models/user.model');

/**
 * Real-time notification delivery (docs/12-notification-system.md §13-15).
 *
 * The socket layer is a one-way push channel only: it creates, reads or
 * deletes nothing. Every notification is persisted first (the DB record is
 * the source of truth); this module merely pushes the already-persisted
 * payload to whichever of the recipient's connections are online. Reads and
 * writes stay on the REST endpoints in routes/notification.routes.js.
 */

let io = null;

// The handshake carries the same HTTP-only cookie as every API request.
// Browsers do send cookies on a cross-origin WebSocket handshake, so the
// session is shared with the REST side with no token in JS reachable storage.
function parseAuthCookie(header) {
  for (const pair of String(header || '').split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === AUTH_COOKIE_NAME) {
      const value = pair.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

/**
 * Socket authentication (docs/12 §14): a connection is only accepted with a
 * valid JWT whose user still exists and is active — the same DB-fresh check
 * middleware/authenticate.js applies to HTTP, so a deactivated account loses
 * real-time delivery too. The verified identity is kept server-side in
 * socket.data; the client never names its own room, so subscribing to another
 * user's channel is impossible.
 */
async function authenticateHandshake(socket, next) {
  try {
    const token = parseAuthCookie(socket.request.headers.cookie);
    if (!token) {
      return next(new Error('Unauthorized'));
    }
    const payload = verifyToken(token);
    const user = await User.findById(payload.userId).select('_id isActive');
    if (!user || !user.isActive) {
      return next(new Error('Unauthorized'));
    }
    socket.data.userId = String(user._id);
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
}

function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      // Same origin policy as the REST API (config/cors.js): the Vite dev
      // server and the configured production origins, with credentials.
      origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
      credentials: true,
    },
  });

  io.use(authenticateHandshake);

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
  });

  return io;
}

// Fire-and-forget push to one user's private room. Safe to call before
// initSockets (e.g. in tests): delivery is an enhancement to the persisted
// record, never a requirement (docs/12 §13).
function emitToUser(userId, payload) {
  if (!io) return;
  io.to(`user:${String(userId)}`).emit('notification', payload);
}

function closeSockets() {
  if (!io) return Promise.resolve();
  const closing = io;
  io = null;
  // Resolve even if the underlying server was already closed by
  // httpServer.close() in the shutdown path.
  return new Promise((resolve) => closing.close(() => resolve()));
}

module.exports = { initSockets, emitToUser, closeSockets };
