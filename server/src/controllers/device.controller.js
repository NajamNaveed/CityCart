const { pushTokenSchema } = require('../validators/device.validator');
const { registerToken, removeToken } = require('../services/deviceToken.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

// The signed-in user's phone, never anyone else's: the user id always comes from the session.
async function register(req, res, next) {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    await registerToken({ userId: req.user._id, ...parsed.data });
    return res.status(200).json({ success: true, message: 'Device registered' });
  } catch (err) {
    return next(err);
  }
}

async function unregister(req, res, next) {
  const parsed = pushTokenSchema.pick({ token: true }).safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    await removeToken({ userId: req.user._id, token: parsed.data.token });
    return res.status(200).json({ success: true, message: 'Device removed' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, unregister };
