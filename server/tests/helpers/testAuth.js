process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';

const { signToken } = require('../../src/utils/jwt');
const { AUTH_COOKIE_NAME } = require('../../src/config/cookie');

/**
 * Builds a real, valid session cookie for a fake user, for tests that
 * need to exercise the actual `authenticate` middleware (JWT sign +
 * verify) end-to-end rather than injecting req.user directly. The
 * corresponding User model must be mocked in the test file, with
 * User.findById set up to resolve this same user (authenticate re-loads
 * the user by id on every request).
 */
function getAuthCookie(user) {
  const token = signToken({ userId: user._id, role: user.role, brandId: user.brandId });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

module.exports = { getAuthCookie };