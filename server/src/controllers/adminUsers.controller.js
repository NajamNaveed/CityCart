const { adminUsersQuerySchema } = require('../validators/adminUsers.validator');
const { listAdminUsers } = require('../services/adminUsers.service');
const { formatZodError } = require('../utils/formatZodError');

async function list(req, res, next) {
  const parsedQuery = adminUsersQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  try {
    const result = await listAdminUsers(parsedQuery.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list };