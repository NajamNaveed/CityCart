const { listNotificationsQuerySchema } = require('../validators/notification.validator');
const {
  listMyNotifications,
  markMyNotificationRead,
  markAllMyNotificationsRead,
  deleteMyNotification,
} = require('../services/notification.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

// GET /notifications — the authenticated user's inbox only (docs/05 §21).
async function list(req, res, next) {
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listMyNotifications(req.user._id, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

// PATCH /notifications/:id/read — 404 unless the notification belongs to the
// caller (ownership lives in the service query, docs/12 §26).
async function markRead(req, res, next) {
  try {
    const notification = await markMyNotificationRead(req.user._id, req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    return res.status(200).json({ success: true, message: 'Notification marked read', notification });
  } catch (err) {
    return next(err);
  }
}

// PATCH /notifications/read-all
async function markAllRead(req, res, next) {
  try {
    const { updated } = await markAllMyNotificationsRead(req.user._id);
    return res.status(200).json({ success: true, message: 'All notifications marked read', updated });
  } catch (err) {
    return next(err);
  }
}

// DELETE /notifications/:id — deleting a notification never touches the
// underlying order/product/payment (docs/12 §24).
async function remove(req, res, next) {
  try {
    const notification = await deleteMyNotification(req.user._id, req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, markRead, markAllRead, remove };
