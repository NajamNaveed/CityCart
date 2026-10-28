const { listAdminActions } = require('../services/adminAction.service');
const { listActivityQuerySchema } = require('../validators/adminPartner.validator');
const { formatZodError } = require('../utils/formatZodError');

async function list(req, res, next) {
  const parsed = listActivityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(parsed.error) });
  }
  try {
    return res.status(200).json({ success: true, ...(await listAdminActions(parsed.data)) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list };
