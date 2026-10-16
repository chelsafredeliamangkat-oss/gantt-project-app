import { addDays, toISODate } from '../lib/dates'
import { DATA_VERSION, DEFAULT_WORKING_DAYS } from '../types'
import type {
  CalendarConfig,
  Dependency,
  Holiday,
  ProjectData,
  Resource,
  Task,
} from '../types'

/** First date on or after `year-month-day` that falls on `weekday` (0 = Sunday). */
export function dateWithWeekday(
  year: number,
  month: number,
  day: number,
  weekday: number,
): Date {
  let date = new Date(year, month - 1, day)
  let guard = 0
  while (date.getDay() !== weekday && guard < 7) {
    date = addDays(date, 1)
    guard += 1
  }
  return date
}

/** A Monday used as the anchor for most scheduling tests. */
export const MONDAY = dateWithWeekday(2026, 10, 5, 1)

export function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    description: '',
    duration: 1,
    startDate: toISODate(MONDAY),
    priority: 'medium',
    color: '#2563eb',
    progress: 0,
    parentId: null,
    dependencies: [],
    assignments: [],
    optimistic: null,
    mostLikely: null,
    pessimistic: null,
    ...overrides,
  }
}

export function dep(
  predecessorId: string,
  type: Dependency['type'] = 'FS',
  lag = 0,
): Dependency {
  return { id: `d-${predecessorId}-${type}-${lag}`, predecessorId, type, lag }
}

export function holiday(date: string, name = 'Libur'): Holiday {
  return { id: `h-${date}`, date, name }
}

export function makeCalendar(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    workingDays: [...DEFAULT_WORKING_DAYS],
    holidays: [],
    ...overrides,
  }
}

export function makeResource(overrides: Partial<Resource> & { id: string }): Resource {
  return {
    name: overrides.id,
    email: `${overrides.id}@example.com`,
    role: 'Anggota',
    salary: 10_000_000,
    color: '#2563eb',
    ...overrides,
  }
}

export function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: DATA_VERSION,
    projectName: 'Proyek Uji',
    tasks: [],
    resources: [],
    calendar: makeCalendar(),
    ...overrides,
  }
}
