import {
  availableSlots,
  customDateOptions,
  customTimeOptions,
  dateOptionsFromSlots,
  durationLabel,
  formatKarachiDate,
  formatKarachiDateTime,
  karachiDateKey,
  karachiDateTimeToIso,
  minuteLabel,
  toPaisa,
} from '../src/utils/serviceSlots'

// Monday 9 November 2026, 08:00 in Karachi (03:00 UTC).
const MONDAY_8AM = Date.UTC(2026, 10, 9, 3, 0)

const availability = (over = {}) => ({
  isPublished: true,
  windows: [{ weekday: 1, startMinute: 540, endMinute: 720, slotMinutes: 60 }],
  blackoutDates: [],
  ...over,
})

describe('labels', () => {
  it('prints a minute of the day as a clock time', () => {
    expect(minuteLabel(0)).toBe('12:00 am')
    expect(minuteLabel(555)).toBe('9:15 am')
    expect(minuteLabel(720)).toBe('12:00 pm')
    expect(minuteLabel(1439)).toBe('11:59 pm')
  })

  it('describes a duration in hours and minutes', () => {
    expect(durationLabel(45)).toBe('45 min')
    expect(durationLabel(60)).toBe('1 h')
    expect(durationLabel(90)).toBe('1 h 30 min')
  })

  it('reads the Karachi date, even across UTC midnight', () => {
    expect(karachiDateKey(0, MONDAY_8AM)).toBe('2026-11-09')
    expect(karachiDateKey(1, MONDAY_8AM)).toBe('2026-11-10')
    // 20:00 UTC is already the next day in Karachi.
    expect(karachiDateKey(0, Date.UTC(2026, 10, 9, 20, 0))).toBe('2026-11-10')
  })

  it('formats an instant as a Karachi calendar date', () => {
    expect(formatKarachiDate('2026-11-09T20:00:00.000Z')).toBe('10 Nov 2026')
    expect(formatKarachiDate('')).toBe('')
    expect(formatKarachiDate('not a date')).toBe('')
  })

  it('formats an instant as a Karachi date and time', () => {
    expect(formatKarachiDateTime('2026-11-09T09:30:00.000Z')).toBe('9 Nov 2026, 2:30 pm')
    expect(formatKarachiDateTime('2026-11-09T20:00:00.000Z')).toBe('10 Nov 2026, 1:00 am')
    expect(formatKarachiDateTime('')).toBe('')
    expect(formatKarachiDateTime('not a date')).toBe('')
  })
})

describe('money', () => {
  it('turns a rupee amount into whole paisa', () => {
    expect(toPaisa('1,200.50')).toBe(120050)
    expect(toPaisa('0')).toBe(0)
    expect(toPaisa('')).toBeNull()
    expect(toPaisa('abc')).toBeNull()
    expect(toPaisa('-5')).toBeNull()
  })
})

describe('availableSlots', () => {
  it('offers nothing when hours are not published', () => {
    expect(availableSlots({ isPublished: false, windows: [] }, 60)).toEqual([])
    expect(availableSlots(null, 60)).toEqual([])
  })

  it('skips times already past and slots that run past closing', () => {
    const slots = availableSlots(availability(), 60, { nowMs: MONDAY_8AM, days: 7 })
    expect(slots.map((slot) => slot.timeLabel)).toEqual(['9:00 am', '10:00 am', '11:00 am'])
    expect(slots[0]).toMatchObject({ dateKey: '2026-11-09', dateLabel: 'Today' })
    expect(slots[0].value).toBe('2026-11-09T04:00:00.000Z')
  })

  it('fits the whole duration inside the window', () => {
    const slots = availableSlots(availability(), 90, { nowMs: MONDAY_8AM, days: 7 })
    expect(slots.map((slot) => slot.timeLabel)).toEqual(['9:00 am', '10:00 am'])
  })

  it('honours blackout dates', () => {
    const slots = availableSlots(availability({ blackoutDates: ['2026-11-09'] }), 60, { nowMs: MONDAY_8AM, days: 7 })
    expect(slots).toEqual([])
  })

  it('looks ahead a day at a time and labels tomorrow', () => {
    const slots = availableSlots(
      availability({
        windows: [
          { weekday: 1, startMinute: 540, endMinute: 660, slotMinutes: 60 },
          { weekday: 2, startMinute: 540, endMinute: 660, slotMinutes: 60 },
        ],
      }),
      60,
      { nowMs: MONDAY_8AM, days: 2 },
    )
    expect(slots.map((slot) => slot.label)).toEqual([
      'Today · 9:00 am',
      'Today · 10:00 am',
      'Tomorrow · 9:00 am',
      'Tomorrow · 10:00 am',
    ])
  })

  it('groups slots into the dates the shopper chooses from', () => {
    const slots = availableSlots(availability(), 60, { nowMs: MONDAY_8AM, days: 7 })
    expect(dateOptionsFromSlots(slots)).toEqual([{ value: '2026-11-09', label: 'Today' }])
  })
})

describe('custom times', () => {
  it('turns a chosen date and minute into the stored instant', () => {
    expect(karachiDateTimeToIso('2026-11-09', 540)).toBe('2026-11-09T04:00:00.000Z')
    expect(karachiDateTimeToIso('2026-02-31', 540)).toBeNull()
    expect(karachiDateTimeToIso('9-11-2026', 540)).toBeNull()
    expect(karachiDateTimeToIso('2026-11-09', 1440)).toBeNull()
  })

  it('offers the next two weeks with today and tomorrow named', () => {
    const dates = customDateOptions({ nowMs: MONDAY_8AM })
    expect(dates).toHaveLength(14)
    expect(dates.slice(0, 2)).toEqual([
      { value: '2026-11-09', label: 'Today' },
      { value: '2026-11-10', label: 'Tomorrow' },
    ])
    expect(dates[2].label).toBe('Wed 11 Nov')
  })

  it('offers half-hour daytime starts and skips the ones already gone', () => {
    expect(customTimeOptions({ dateKey: '2026-11-10', nowMs: MONDAY_8AM })).toHaveLength(24)
    const today = customTimeOptions({ dateKey: '2026-11-09', nowMs: MONDAY_8AM })
    expect(today[0]).toEqual({ value: 540, label: '9:00 am' })
    // 23:00 in Karachi: nothing left today.
    expect(customTimeOptions({ dateKey: '2026-11-09', nowMs: Date.UTC(2026, 10, 9, 18, 0) })).toEqual([])
  })
})
