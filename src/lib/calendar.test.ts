import { describe, expect, it } from 'vitest'
import { createWorkCalendar } from './calendar'
import { addDays, dayNumber, toISODate, weekdayOfDayNumber } from './dates'
import { MONDAY, holiday, makeCalendar } from '../test/factories'

const EPOCH = new Date(1970, 0, 1)

/** Independent, obviously-correct reference implementation. */
function bruteCount(
  from: Date,
  toExclusive: Date,
  isWorking: (date: Date) => boolean,
): number {
  let count = 0
  let cursor = from
  let guard = 0
  while (cursor.getTime() < toExclusive.getTime() && guard < 40_000) {
    if (isWorking(cursor)) count += 1
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return count
}

describe('weekdayOfDayNumber', () => {
  it('agrees with Date.getDay', () => {
    for (let offset = 0; offset < 21; offset += 1) {
      const date = addDays(MONDAY, offset)
      expect(weekdayOfDayNumber(dayNumber(date))).toBe(date.getDay())
    }
  })

  it('knows 1970-01-01 was a Thursday', () => {
    expect(weekdayOfDayNumber(0)).toBe(4)
  })
})

describe('createWorkCalendar', () => {
  it('treats Saturday and Sunday as non-working days', () => {
    const calendar = createWorkCalendar(makeCalendar())
    expect(calendar.isWorkingDay(addDays(MONDAY, 4))).toBe(true) // Jumat
    expect(calendar.isWorkingDay(addDays(MONDAY, 5))).toBe(false) // Sabtu
    expect(calendar.isWorkingDay(addDays(MONDAY, 6))).toBe(false) // Minggu
    expect(calendar.isWorkingDay(addDays(MONDAY, 7))).toBe(true) // Senin berikutnya
  })

  it('drives the working week from the config', () => {
    // Minggu - Kamis (akhir pekan Jumat & Sabtu)
    const calendar = createWorkCalendar(makeCalendar({ workingDays: [0, 1, 2, 3, 4] }))
    expect(calendar.isWorkingDay(addDays(MONDAY, 3))).toBe(true) // Kamis
    expect(calendar.isWorkingDay(addDays(MONDAY, 4))).toBe(false) // Jumat
    expect(calendar.isWorkingDay(addDays(MONDAY, 6))).toBe(true) // Minggu
  })

  it('removes holidays that land on a working weekday', () => {
    const wednesday = addDays(MONDAY, 2)
    const calendar = createWorkCalendar(
      makeCalendar({ holidays: [holiday(toISODate(wednesday))] }),
    )
    expect(calendar.isWorkingDay(wednesday)).toBe(false)
    expect(calendar.countWorkingDays(MONDAY, addDays(MONDAY, 5))).toBe(4)
  })

  it('ignores holidays that land on a non-working day', () => {
    const saturday = addDays(MONDAY, 5)
    const calendar = createWorkCalendar(
      makeCalendar({ holidays: [holiday(toISODate(saturday))] }),
    )
    expect(calendar.countWorkingDays(MONDAY, addDays(MONDAY, 7))).toBe(5)
  })

  it('counts exactly like a day-by-day scan', () => {
    const calendar = createWorkCalendar(
      makeCalendar({
        holidays: [
          holiday('2026-10-28'),
          holiday('2026-12-25'),
          holiday('2026-10-17'), // Sabtu, harus diabaikan
          holiday('2027-01-01'),
        ],
      }),
    )
    const isWorking = (date: Date) => calendar.isWorkingDay(date)
    for (const offset of [0, 1, 3, 10, 30, 120, 366, 730, 1800]) {
      const date = addDays(MONDAY, offset)
      expect(calendar.ordinalOf(date)).toBe(bruteCount(EPOCH, date, isWorking))
    }
  })

  it('counts like a day-by-day scan for a non Mon-Fri working week too', () => {
    const calendar = createWorkCalendar(
      makeCalendar({ workingDays: [0, 2, 4], holidays: [holiday('2026-11-04')] }),
    )
    const isWorking = (date: Date) => calendar.isWorkingDay(date)
    for (const offset of [0, 7, 40, 200, 900]) {
      const date = addDays(MONDAY, offset)
      expect(calendar.ordinalOf(date)).toBe(bruteCount(EPOCH, date, isWorking))
    }
  })

  it('handles ranges that run backwards', () => {
    const calendar = createWorkCalendar(makeCalendar())
    const forward = calendar.countWorkingDays(MONDAY, addDays(MONDAY, 10))
    const backward = calendar.countWorkingDays(addDays(MONDAY, 10), MONDAY)
    expect(backward).toBe(-forward)
  })

  it('round-trips ordinals and dates across holidays', () => {
    const calendar = createWorkCalendar(
      makeCalendar({ holidays: [holiday('2026-10-28'), holiday('2026-11-16')] }),
    )
    const start = calendar.ordinalOf(MONDAY)
    for (let ordinal = start - 60; ordinal < start + 300; ordinal += 1) {
      const date = calendar.dateOfOrdinal(ordinal)
      expect(calendar.isWorkingDay(date)).toBe(true)
      expect(calendar.ordinalOf(date)).toBe(ordinal)
    }
  })

  it('snaps forward and backward off a weekend', () => {
    const calendar = createWorkCalendar(makeCalendar())
    const saturday = addDays(MONDAY, 5)
    expect(toISODate(calendar.snapForward(saturday))).toBe(toISODate(addDays(MONDAY, 7)))
    expect(toISODate(calendar.snapBackward(saturday))).toBe(toISODate(addDays(MONDAY, 4)))
    expect(calendar.ordinalOf(saturday)).toBe(calendar.ordinalOf(addDays(MONDAY, 7)))
  })

  it('adds and subtracts working days', () => {
    const calendar = createWorkCalendar(makeCalendar())
    expect(toISODate(calendar.addWorkingDays(MONDAY, 4))).toBe(toISODate(addDays(MONDAY, 4)))
    expect(toISODate(calendar.addWorkingDays(MONDAY, 5))).toBe(toISODate(addDays(MONDAY, 7)))
    expect(toISODate(calendar.addWorkingDays(MONDAY, -1))).toBe(
      toISODate(addDays(MONDAY, -3)),
    )
    expect(toISODate(calendar.addWorkingDays(addDays(MONDAY, 5), 0))).toBe(
      toISODate(addDays(MONDAY, 7)),
    )
  })

  it('skips a holiday when adding working days', () => {
    const thursday = addDays(MONDAY, 3)
    const calendar = createWorkCalendar(
      makeCalendar({ holidays: [holiday(toISODate(addDays(MONDAY, 1)))] }),
    )
    // Senin(1) + 1 hari kerja, dengan Selasa libur, mendarat di Rabu.
    expect(toISODate(calendar.addWorkingDays(MONDAY, 1))).toBe(
      toISODate(addDays(MONDAY, 2)),
    )
    // Kamis + 2 hari kerja = Senin pekan berikutnya.
    expect(toISODate(calendar.addWorkingDays(thursday, 2))).toBe(
      toISODate(addDays(MONDAY, 7)),
    )
  })

  it('computes finish dates and durations from working days', () => {
    const calendar = createWorkCalendar(makeCalendar())
    expect(toISODate(calendar.finishOf(MONDAY, 1))).toBe(toISODate(MONDAY))
    expect(toISODate(calendar.finishOf(MONDAY, 5))).toBe(toISODate(addDays(MONDAY, 4)))
    expect(calendar.durationBetween(MONDAY, addDays(MONDAY, 4))).toBe(5)
    // Senin s/d Senin pekan berikutnya = 6 hari kerja
    expect(calendar.durationBetween(MONDAY, addDays(MONDAY, 7))).toBe(6)
    expect(calendar.durationBetween(addDays(MONDAY, 4), MONDAY)).toBe(1)
  })

  it('lists calendar days and working days', () => {
    const calendar = createWorkCalendar(makeCalendar())
    const days = calendar.eachDay(MONDAY, addDays(MONDAY, 7))
    expect(days).toHaveLength(7)
    expect(calendar.eachWorkingDay(MONDAY, addDays(MONDAY, 7))).toHaveLength(5)
  })

  it('reports an empty working week instead of looping forever', () => {
    const calendar = createWorkCalendar(makeCalendar({ workingDays: [] }))
    expect(() => calendar.dateOfOrdinal(3)).toThrow()
    expect(calendar.countWorkingDays(MONDAY, addDays(MONDAY, 10))).toBe(0)
  })
})
