jest.mock('../src/models/serviceAvailability.model', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  MAX_BLACKOUT_DATES: 60,
}));

const ServiceAvailability = require('../src/models/serviceAvailability.model');
const {
  serializeAvailability,
  replaceAvailability,
  getAvailability,
  assertSlotWithinAvailability,
  ServiceAvailabilityError,
} = require('../src/services/serviceAvailability.service');

const window = (over = {}) => ({ weekday: 1, startMinute: 600, endMinute: 720, slotMinutes: 60, ...over });

describe('availability serialisation', () => {
  it('sorts windows, labels Karachi times and reports whether hours were published', () => {
    const doc = {
      windows: [window({ weekday: 3, startMinute: 540, endMinute: 600 }), window({ weekday: 0, startMinute: 480, endMinute: 540 })],
      blackoutDates: ['2026-12-25', '2026-11-09'],
      updatedAt: new Date('2026-11-01T00:00:00Z'),
    };

    const result = serializeAvailability(doc);

    expect(result.windows.map((w) => w.weekday)).toEqual([0, 3]);
    expect(result.windows[0]).toMatchObject({ weekdayName: 'Sunday', start: '08:00', end: '09:00' });
    expect(result.blackoutDates).toEqual(['2026-11-09', '2026-12-25']);
    expect(result.isPublished).toBe(true);
  });

  it('reports unpublished hours when there are no windows', () => {
    expect(serializeAvailability(null)).toMatchObject({ windows: [], blackoutDates: [], isPublished: false });
  });
});

describe('replaceAvailability', () => {
  beforeEach(() => jest.resetAllMocks());

  it('rejects overlapping windows on the same weekday', async () => {
    await expect(
      replaceAvailability('p1', {
        windows: [window({ startMinute: 600, endMinute: 720 }), window({ startMinute: 700, endMinute: 800 })],
      })
    ).rejects.toMatchObject({ status: 400, code: 'OVERLAPPING_WINDOWS' });
    expect(ServiceAvailability.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows identical hours on different weekdays and stores them sorted', async () => {
    ServiceAvailability.findOneAndUpdate.mockImplementation(async (filter, update) => ({
      windows: update.$set.windows,
      blackoutDates: update.$set.blackoutDates,
    }));

    const result = await replaceAvailability('p1', {
      windows: [window({ weekday: 5, startMinute: 540 }), window({ weekday: 2, startMinute: 300, endMinute: 420 })],
      blackoutDates: ['2026-12-25', '2026-12-25', '2026-11-09'],
    });

    expect(ServiceAvailability.findOneAndUpdate).toHaveBeenCalledWith(
      { providerId: 'p1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          windows: [expect.objectContaining({ weekday: 2 }), expect.objectContaining({ weekday: 5 })],
          blackoutDates: ['2026-11-09', '2026-12-25'],
        }),
      }),
      expect.objectContaining({ upsert: true })
    );
    expect(result.windows).toHaveLength(2);
  });
});

describe('assertSlotWithinAvailability', () => {
  const now = new Date('2026-11-01T00:00:00Z'); // 05:00 Karachi, Sunday.
  const availability = {
    windows: [window({ weekday: 1, startMinute: 600, endMinute: 720, slotMinutes: 60 })],
    blackoutDates: ['2026-11-10'],
  };
  const at = (iso) => new Date(iso);

  it('accepts a future slot that fits entirely inside a window (Karachi wall clock)', () => {
    // 2026-11-09T05:00Z = Monday 10:00 Karachi.
    const { start, end } = assertSlotWithinAvailability(availability, at('2026-11-09T05:00:00.000Z'), 60, { now });
    expect(start.toISOString()).toBe('2026-11-09T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-09T06:00:00.000Z');
  });

  it('rejects a past time and a time beyond the booking horizon', () => {
    expect(() => assertSlotWithinAvailability(availability, at('2026-10-31T05:00:00.000Z'), 60, { now })).toThrow(
      expect.objectContaining({ code: 'SLOT_IN_PAST' })
    );
    expect(() => assertSlotWithinAvailability(availability, at('2027-01-10T05:00:00.000Z'), 60, { now })).toThrow(
      expect.objectContaining({ code: 'SLOT_TOO_FAR' })
    );
  });

  it('rejects a blackout date before checking the window', () => {
    expect(() => assertSlotWithinAvailability(availability, at('2026-11-10T05:00:00.000Z'), 60, { now })).toThrow(
      expect.objectContaining({ code: 'BLACKOUT_DATE' })
    );
  });

  it('rejects a slot outside the working window, including one that runs past its end', () => {
    expect(() => assertSlotWithinAvailability(availability, at('2026-11-09T02:00:00.000Z'), 60, { now })).toThrow(
      expect.objectContaining({ code: 'OUTSIDE_AVAILABILITY' })
    );
    expect(() => assertSlotWithinAvailability(availability, at('2026-11-09T06:30:00.000Z'), 60, { now })).toThrow(
      expect.objectContaining({ code: 'OUTSIDE_AVAILABILITY' })
    );
  });

  it('accepts any future slot when the provider has not published hours', () => {
    expect(() =>
      assertSlotWithinAvailability({ windows: [], blackoutDates: [] }, at('2026-11-09T02:00:00.000Z'), 60, { now })
    ).not.toThrow();
  });

  it('rejects an invalid date', () => {
    expect(() => assertSlotWithinAvailability(availability, 'not-a-date', 60, { now })).toThrow(ServiceAvailabilityError);
  });
});

describe('getAvailability', () => {
  it('reads only the signed-in provider', async () => {
    ServiceAvailability.findOne.mockResolvedValue(null);
    const result = await getAvailability('p9');
    expect(ServiceAvailability.findOne).toHaveBeenCalledWith({ providerId: 'p9' });
    expect(result.isPublished).toBe(false);
  });
});
