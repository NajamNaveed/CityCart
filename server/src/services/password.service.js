const User = require('../models/user.model');
const { hashPassword, comparePassword } = require('../utils/password');

class PasswordError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function replacePasswordHash({ userId, newPassword, expectedPasswordHash }) {
  const passwordHash = await hashPassword(newPassword);
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, ...(expectedPasswordHash !== undefined && { passwordHash: expectedPasswordHash }) },
    { $set: { passwordHash }, $inc: { passwordVersion: 1 } },
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    throw new PasswordError(409, 'Password changed during this request. Please try again.');
  }
  return updatedUser;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !user.isActive) {
    throw new PasswordError(401, 'Invalid or expired session.');
  }

  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    throw new PasswordError(400, 'Current password is incorrect.');
  }
  if (await comparePassword(newPassword, user.passwordHash)) {
    throw new PasswordError(400, 'Choose a password you have not used for this account.');
  }

  return replacePasswordHash({
    userId,
    newPassword,
    expectedPasswordHash: user.passwordHash,
  });
}

module.exports = { changePassword, replacePasswordHash, PasswordError };