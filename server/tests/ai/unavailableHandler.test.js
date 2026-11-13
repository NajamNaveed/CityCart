const express = require('express');
const request = require('supertest');

const { errorHandler } = require('../../src/middleware/errorHandler');
const { AiUnavailableError } = require('../../src/services/ai/errors');

function appThrowing(error) {
  const app = express();
  app.get('/boom', (req, res, next) => next(error));
  app.use(errorHandler);
  return app;
}

describe('AI unavailable error mapping', () => {
  it('answers 503 AI_UNAVAILABLE without leaking the reason', async () => {
    const res = await request(appThrowing(new AiUnavailableError('disabled'))).get('/boom');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      message: 'AI is unavailable right now.',
      code: 'AI_UNAVAILABLE',
    });
  });
});
