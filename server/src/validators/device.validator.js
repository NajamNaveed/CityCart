const { z } = require('zod');
const { TOKEN_PATTERN } = require('../services/deviceToken.service');

const pushTokenSchema = z.object({
  token: z.string().trim().regex(TOKEN_PATTERN, 'token must be an Expo push token'),
  platform: z.enum(['android', 'ios']).optional(),
});

module.exports = { pushTokenSchema };
