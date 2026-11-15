const { availableSlots, filterSlots, karachiDay, karachiKey } = require('../src/utils/serviceSlots');

// Sunday 15 Nov 2026, 11:00 in Karachi (06:00 UTC). Pakistan is UTC+5 all year.
const NOW = Date.parse('2026-11-15T06:00:00Z');

const availability = (over = {}) => ({
  windows: [
    { weekday: 0, startMinute: 540, endMinute: 1080, slotMinutes: 60 },
    { weekday: 1, startMinute: 540, endMinute: 1080, slotMinutes: 60 },
  ],
  blackoutDates: [],
  isPublished: true,
  ...over,
});

describe('availableSlots', () => {
  it('turns Karachi windows into future bookable starts', () => {
    const slots = availableSlots(availability(), 60, { days: 1, nowMs: NOW });

    expect(slots[0]).toMatchObject({
      label: 'Sun 15 Nov · 12:00 pm',
      dateKey: '2026-11-15',
      startMinute: 720,
    });
    expect(new Date(slots[0].start).toISOString()).toBe('2026-11-15T07:00:00.000Z');
    // 11:00 is not offered because it is not in the future any more.
    expect(slots.some((slot) => slot.startMinute === 660)).toBe(false);
    expect(slots[slots.length - 1].startMinute).toBe(1020);
  });

  it('skips blackout dates and days without a window', () => {
    const slots = availableSlots(availability({ blackoutDates: ['2026-11-16'] }), 60, {
      days: 3,
      nowMs: NOW,
    });

    expect(slots.every((slot) => slot.dateKey !== '2026-11-16')).toBe(true);
    expect(slots.some((slot) => slot.dateKey === '2026-11-17')).toBe(false);
  });

  it('only offers a start when the whole job fits the window', () => {
    const slots = availableSlots(availability(), 90, { days: 1, nowMs: NOW });
    const starts = slots.map((slot) => slot.startMinute);

    expect(starts).toContain(720); // 12:00–13:30
    expect(starts).toContain(780); // 13:00–14:30
    expect(starts).not.toContain(1020); // 17:00–18:30 runs past 18:00
  });

  it('returns nothing when the provider has not published hours', () => {
    expect(availableSlots(availability({ windows: [] }), 60, { days: 5, nowMs: NOW })).toEqual([]);
  });
});

describe('filterSlots', () => {
  const slots = availableSlots(availability(), 60, { days: 2, nowMs: NOW });

  it('narrows to one Karachi day', () => {
    const tomorrow = filterSlots(slots, { day: 1, nowMs: NOW });
    const key = karachiKey(karachiDay(1, NOW));

    expect(tomorrow.length).toBeGreaterThan(0);
    expect(tomorrow.every((slot) => slot.dateKey === key)).toBe(true);
  });

  it('narrows to a part of the day', () => {
    const evening = filterSlots(slots, { part: 'evening', nowMs: NOW });
    expect(evening.every((slot) => slot.startMinute >= 1020)).toBe(true);
  });

  it('leaves the list alone for an unknown part', () => {
    expect(filterSlots(slots, { part: 'midnight', nowMs: NOW })).toHaveLength(slots.length);
  });
});
