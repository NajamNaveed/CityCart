const env = require('../../../config/env');
const { createOpenAiCompatibleProvider } = require('./openaiCompatible');

module.exports = createOpenAiCompatibleProvider({
  name: 'openrouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  model: env.ai.openrouter.model,
  apiKey: env.ai.openrouter.apiKey,
  // OpenRouter uses these for its per-app attribution; they are optional.
  extraHeaders: {
    'HTTP-Referer': env.clientUrl,
    'X-Title': 'CityCart',
  },
});
