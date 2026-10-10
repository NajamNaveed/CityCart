const { z } = require('zod');

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid date.');

const analyticsQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: 'from must be on or before to.',
    path: ['from'],
  });

function resolveDateRange({ from, to } = {}, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultStart = new Date(today);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);
  const start = from ? new Date(`${from}T00:00:00.000Z`) : defaultStart;
  const endDate = to ? new Date(`${to}T00:00:00.000Z`) : today;
  const endExclusive = new Date(endDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return {
    from: start,
    to: endExclusive,
    labels: {
      from: start.toISOString().slice(0, 10),
      to: new Date(endExclusive.getTime() - 1).toISOString().slice(0, 10),
    },
  };
}

module.exports = { analyticsQuerySchema, resolveDateRange };