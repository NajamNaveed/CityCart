const env = require('../../../config/env');
const { createOpenAiCompatibleProvider } = require('./openaiCompatible');

module.exports = createOpenAiCompatibleProvider({
  name: 'groq',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  model: env.ai.groq.model,
  apiKey: env.ai.groq.apiKey,
});
