const DeviceToken = require('../models/deviceToken.model');
const Notification = require('../models/notification.model');
const RiderLocation = require('../models/riderLocation.model');
const { disconnectUserSockets } = require('../sockets');

/**
 * Central revocation for every removal path (docs/24 §3.7).
 *
 * Sessions need no explicit table: authentication reloads the User and the
 * membership on every request, so deactivating either one takes effect on the
 * next call. What is left is delivery state that would otherwise keep pushing
 * to a person who is no longer there: push tokens, queued (unread)
 * notifications, live sockets and a rider's last known location.
 *
 * Options let a mere removal from one brand keep delivery for the person's
 * other memberships.
 */
async function revokeUserDelivery(
  userId,
  { deviceTokens = true, notifications = true, sockets = true } = {}
) {
  const work = [];
  if (deviceTokens) work.push(DeviceToken.deleteMany({ userId }));
  if (notifications) work.push(Notification.deleteMany({ userId, isRead: false }));
  await Promise.all(work);
  if (sockets) disconnectUserSockets(userId);
}

// A removed rider must not keep a stale position on customers' maps.
async function clearRiderLocation(riderId) {
  await RiderLocation.deleteOne({ riderId });
}

module.exports = { revokeUserDelivery, clearRiderLocation };
