const { discoverQuerySchema } = require('../validators/discover.validator');
const { discover, DiscoverError } = require('../services/discover.service');
const { formatZodError } = require('../utils/formatZodError');

async function search(req, res, next) {
  const parsed = discoverQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const result = await discover(parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    if (err instanceof DiscoverError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { search };
