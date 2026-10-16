/**
 * Date helpers.
 *
 * Everything works on "day numbers": the number of days since 1970-01-01 in
 * local time. Local-midnight arithmetic keeps DST transitions from shifting a
 * date by an hour, and `Math.round` absorbs the 23/25 hour days.
 */

export const MS_PER_DAY = 86_400_000

/** 1970-01-01 was a Thursday. */
const EPOCH_WEEKDAY = 4

const EPOCH = new Date(1970, 0, 1)

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Parses a `yyyy-MM-dd` string into a local-midnight Date. */
export function parseISODate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return startOfDay(new Date())
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

/** Days since 1970-01-01 (local time). */
export function dayNumber(date: Date): number {
  return Math.round((startOfDay(date).getTime() - EPOCH.getTime()) / MS_PER_DAY)
}

export function dateFromDayNumber(dayNum: number): Date {
  return addDays(EPOCH, dayNum)
}

/** Weekday (0 = Sunday) for a day number. */
export function weekdayOfDayNumber(dayNum: number): number {
  return (((EPOCH_WEEKDAY + dayNum) % 7) + 7) % 7
}

export function diffInDays(later: Date, earlier: Date): number {
  return dayNumber(later) - dayNumber(earlier)
}

export function isWeekend(date: Date, workingDays: number[]): boolean {
  return !workingDays.includes(date.getDay())
}

/** Today, captured once at module load so rendering stays pure. */
export const TODAY = new Date()

export const TODAY_ISO = toISODate(TODAY)

export function todayDayNumber(): number {
  return dayNumber(TODAY)
}

/** Monday of the week containing `date` (weeks start on Monday). */
export function startOfWeek(date: Date): Date {
  const dow = date.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  return addDays(date, offset)
}

/** The next Monday at 00:00, strictly after today's date. */
export function nextMonday(from: Date = new Date()): Date {
  const base = addDays(startOfDay(from), 1)
  while (base.getDay() !== 1) base.setDate(base.getDate() + 1)
  return base
}
