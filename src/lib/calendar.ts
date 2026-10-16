/**
 * Working-day calendar.
 *
 * All scheduling is expressed in *working-day ordinals*: 0 is the first working
 * day in [1970-01-01, ...), 1 the next one, and so on. Working in ordinals
 * instead of Dates turns the CPM maths into plain integer arithmetic.
 *
 * A date that is not a working day keeps the ordinal of the *next* working day,
 * so `ordinalOf()` doubles as a "start no earlier than" snap.
 */

import type { CalendarConfig } from '../types'
import {
  dateFromDayNumber,
  dayNumber,
  parseISODate,
  weekdayOfDayNumber,
} from './dates'

export interface WorkCalendar {
  readonly config: CalendarConfig
  /** Sorted working weekdays (0 = Sunday). */
  readonly workingDays: number[]
  readonly holidayDates: string[]
  /** True when the date is a working day. */
  isWorkingDay(date: Date): boolean
  /** Number of working days in [1970-01-01, date). */
  ordinalOf(date: Date): number
  /** The n-th working day (0-based). Throws when there is no working weekday. */
  dateOfOrdinal(ordinal: number): Date
  /** The given date, or the next working day if it is not one. */
  snapForward(date: Date): Date
  /** The given date, or the previous working day if it is not one. */
  snapBackward(date: Date): Date
  /** Moves by `amount` working days (negative walks backwards). Snaps forward first. */
  addWorkingDays(date: Date, amount: number): Date
  /** Working days in [from, toExclusive). */
  countWorkingDays(from: Date, toExclusive: Date): number
  /** Working days in [from, to], inclusive on both ends. */
  countWorkingDaysInclusive(from: Date, to: Date): number
  /** Calendar days in [from, toExclusive). */
  eachDay(from: Date, toExclusive: Date): Date[]
  /** Working days in [from, toExclusive). */
  eachWorkingDay(from: Date, toExclusive: Date): Date[]
  /** Finish date of a task starting on `start` with `duration` working days. */
  finishOf(start: Date, duration: number): Date
  /** Working-day duration between two dates, inclusive. Always at least 1. */
  durationBetween(start: Date, finish: Date): number
}

/** Escapes a calendar day range so a bad input cannot lock up the browser. */
const MAX_RANGE_DAYS = 4000

export function createWorkCalendar(config: CalendarConfig): WorkCalendar {
  const workingDays = [...new Set(config.workingDays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
  const workingSet = new Set(workingDays)
  const workingDaysPerWeek = workingDays.length

  // Only holidays that fall on a configured working weekday actually remove work,
  // and pre-filtering them keeps the range count a single pass.
  const blockingHolidayNumbers = new Set<number>()
  for (const holiday of config.holidays) {
    const dayNum = dayNumber(parseISODate(holiday.date))
    if (workingSet.has(weekdayOfDayNumber(dayNum))) {
      blockingHolidayNumbers.add(dayNum)
    }
  }

  function isWorkingDayNumber(dayNum: number): boolean {
    return workingSet.has(weekdayOfDayNumber(dayNum)) && !blockingHolidayNumbers.has(dayNum)
  }

  function isWorkingDay(date: Date): boolean {
    return isWorkingDayNumber(dayNumber(date))
  }

  /**
   * Working days in the half-open day-number range [fromNum, toNum).
   * Full weeks contribute a fixed count, the remainder is walked day by day and
   * blocking holidays are subtracted afterwards.
   */
  function countRange(fromNum: number, toNum: number): number {
    if (fromNum === toNum || workingDaysPerWeek === 0) return 0
    if (fromNum > toNum) return -countRange(toNum, fromNum)

    const span = toNum - fromNum
    const weeks = Math.floor(span / 7)
    const remainder = span - weeks * 7
    const windowStart = fromNum + weeks * 7

    let count = weeks * workingDaysPerWeek
    for (let offset = 0; offset < remainder; offset += 1) {
      if (workingSet.has(weekdayOfDayNumber(windowStart + offset))) count += 1
    }
    for (const holidayNum of blockingHolidayNumbers) {
      if (holidayNum >= fromNum && holidayNum < toNum) count -= 1
    }
    return count
  }

  function ordinalOf(date: Date): number {
    return countRange(0, dayNumber(date))
  }

  function dateOfOrdinal(ordinal: number): Date {
    if (workingDaysPerWeek === 0) {
      throw new Error('Kalender tidak memiliki hari kerja')
    }
    const target = Math.round(ordinal)
    // A full week holds exactly `workingDaysPerWeek` working days, so this guess
    // is at most one week off and the loops below run only a handful of times.
    let guess = Math.floor((target * 7) / workingDaysPerWeek)

    let guard = 0
    while (countRange(0, guess) > target) {
      guess -= 1
      guard += 1
      if (guard > 64) throw new Error('dateOfOrdinal: gagal menemukan hari kerja')
    }
    while (!(isWorkingDayNumber(guess) && countRange(0, guess) === target)) {
      guess += 1
      guard += 1
      if (guard > 128) throw new Error('dateOfOrdinal: gagal menemukan hari kerja')
    }
    return dateFromDayNumber(guess)
  }

  function snapForward(date: Date): Date {
    let dayNum = dayNumber(date)
    let guard = 0
    while (!isWorkingDayNumber(dayNum) && guard < MAX_RANGE_DAYS) {
      dayNum += 1
      guard += 1
    }
    return dateFromDayNumber(dayNum)
  }

  function snapBackward(date: Date): Date {
    let dayNum = dayNumber(date)
    let guard = 0
    while (!isWorkingDayNumber(dayNum) && guard < MAX_RANGE_DAYS) {
      dayNum -= 1
      guard += 1
    }
    return dateFromDayNumber(dayNum)
  }

  function addWorkingDays(date: Date, amount: number): Date {
    const snapped = snapForward(date)
    const steps = Math.round(amount)
    if (steps === 0) return snapped
    if (workingDaysPerWeek === 0) return snapped
    return dateOfOrdinal(ordinalOf(snapped) + steps)
  }

  function countWorkingDays(from: Date, toExclusive: Date): number {
    return countRange(dayNumber(from), dayNumber(toExclusive))
  }

  function eachDay(from: Date, toExclusive: Date): Date[] {
    const startNum = dayNumber(from)
    const endNum = Math.min(dayNumber(toExclusive), startNum + MAX_RANGE_DAYS)
    const days: Date[] = []
    for (let dayNum = startNum; dayNum < endNum; dayNum += 1) {
      days.push(dateFromDayNumber(dayNum))
    }
    return days
  }

  function eachWorkingDay(from: Date, toExclusive: Date): Date[] {
    return eachDay(from, toExclusive).filter(isWorkingDay)
  }

  function finishOf(start: Date, duration: number): Date {
    const span = Math.max(1, Math.round(duration))
    return addWorkingDays(start, span - 1)
  }

  function durationBetween(start: Date, finish: Date): number {
    const spanEnd = snapBackward(finish)
    const spanStart = snapForward(start)
    const working = countRange(dayNumber(spanStart), dayNumber(spanEnd) + 1)
    return Math.max(1, working)
  }

  return {
    config,
    workingDays,
    holidayDates: config.holidays.map((holiday) => holiday.date),
    isWorkingDay,
    ordinalOf,
    dateOfOrdinal,
    snapForward,
    snapBackward,
    addWorkingDays,
    countWorkingDays,
    countWorkingDaysInclusive: (from, to) =>
      countWorkingDays(from, dateFromDayNumber(dayNumber(to) + 1)),
    eachDay,
    eachWorkingDay,
    finishOf,
    durationBetween,
  }
}
