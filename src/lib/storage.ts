/**
 * localStorage persistence.
 *
 * Everything read back is passed through `normalizeProject`, so a stale or
 * hand-edited payload can never crash the app: unknown fields are dropped and
 * broken references (missing parents, dangling dependencies) are repaired.
 */

import {
  DATA_VERSION,
  DEFAULT_WORKING_DAYS,
  PRIORITY_ORDER,
  STORAGE_KEY,
  TASK_COLORS,
} from '../types'
import type {
  Assignment,
  CalendarConfig,
  Dependency,
  Holiday,
  Priority,
  ProjectData,
  Resource,
  Task,
} from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function asISODate(value: unknown, fallback: string): string {
  const text = asString(value)
  return ISO_PATTERN.test(text) ? text : fallback
}

function asPriority(value: unknown): Priority {
  const text = asString(value)
  return (PRIORITY_ORDER as string[]).includes(text) ? (text as Priority) : 'medium'
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = asNumber(value, fallback)
  return Math.round(parsed)
}

function normalizeDependency(raw: unknown, taskIds: Set<string>): Dependency | null {
  if (!isRecord(raw)) return null
  const predecessorId = asString(raw.predecessorId)
  if (!predecessorId || !taskIds.has(predecessorId)) return null
  const type = asString(raw.type) === 'SS' ? 'SS' : 'FS'
  return {
    id: asString(raw.id) || `d-${predecessorId}`,
    predecessorId,
    type,
    lag: asInteger(raw.lag, 0),
  }
}

function normalizeAssignment(raw: unknown, resourceIds: Set<string>): Assignment | null {
  if (!isRecord(raw)) return null
  const resourceId = asString(raw.resourceId)
  if (!resourceId || !resourceIds.has(resourceId)) return null
  const allocation = Math.min(100, Math.max(1, asInteger(raw.allocation, 100)))
  return { resourceId, allocation }
}

function normalizeResource(raw: unknown, index: number): Resource | null {
  if (!isRecord(raw)) return null
  const name = asString(raw.name).trim()
  if (!name) return null
  return {
    id: asString(raw.id) || `r-${index}`,
    name,
    email: asString(raw.email),
    role: asString(raw.role),
    salary: Math.max(0, asNumber(raw.salary)),
    color: asString(raw.color) || (TASK_COLORS[index % TASK_COLORS.length] as string),
  }
}

function normalizeHoliday(raw: unknown, index: number): Holiday | null {
  if (!isRecord(raw)) return null
  const date = asString(raw.date)
  if (!ISO_PATTERN.test(date)) return null
  return {
    id: asString(raw.id) || `h-${index}`,
    date,
    name: asString(raw.name, 'Hari libur'),
  }
}

function normalizeCalendar(raw: unknown): CalendarConfig {
  const source = isRecord(raw) ? raw : {}
  const workingDays = Array.isArray(source.workingDays)
    ? [...new Set(source.workingDays.map((day) => asInteger(day, -1)))].filter(
        (day) => day >= 0 && day <= 6,
      )
    : []

  const holidays = Array.isArray(source.holidays)
    ? source.holidays
        .map((holiday, index) => normalizeHoliday(holiday, index))
        .filter((holiday): holiday is Holiday => holiday !== null)
    : []

  return {
    workingDays:
      workingDays.length > 0 ? workingDays.sort((a, b) => a - b) : [...DEFAULT_WORKING_DAYS],
    holidays,
  }
}

export function normalizeProject(input: unknown): ProjectData | null {
  if (!isRecord(input)) return null
  const rawTasks = Array.isArray(input.tasks) ? input.tasks : null
  const rawResources = Array.isArray(input.resources) ? input.resources : null
  if (!rawTasks || !rawResources) return null

  const resources = rawResources
    .map((resource, index) => normalizeResource(resource, index))
    .filter((resource): resource is Resource => resource !== null)
  const resourceIds = new Set(resources.map((resource) => resource.id))

  const seenIds = new Set<string>()
  const tasks: Task[] = []
  /** Parallel to `tasks`, so a skipped raw entry cannot shift the alignment. */
  const rawById: Array<Record<string, unknown>> = []
  for (const [index, rawTask] of rawTasks.entries()) {
    if (!isRecord(rawTask)) continue
    const name = asString(rawTask.name).trim()
    if (!name) continue
    let id = asString(rawTask.id) || `t-${index}`
    while (seenIds.has(id)) id = `${id}-${index}`
    seenIds.add(id)
    rawById.push(rawTask)

    tasks.push({
      id,
      name,
      description: asString(rawTask.description),
      duration: Math.max(0, asInteger(rawTask.duration, 1)),
      startDate: asISODate(rawTask.startDate, new Date().toISOString().slice(0, 10)),
      priority: asPriority(rawTask.priority),
      color: asString(rawTask.color) || (TASK_COLORS[index % TASK_COLORS.length] as string),
      progress: Math.min(100, Math.max(0, asInteger(rawTask.progress, 0))),
      parentId: null,
      dependencies: Array.isArray(rawTask.dependencies) ? rawTask.dependencies : [],
      assignments: Array.isArray(rawTask.assignments) ? rawTask.assignments : [],
      optimistic: asNullableNumber(rawTask.optimistic),
      mostLikely: asNullableNumber(rawTask.mostLikely),
      pessimistic: asNullableNumber(rawTask.pessimistic),
   })
  }

  const taskIds = new Set(tasks.map((task) => task.id))

  for (const [index, task] of tasks.entries()) {
    const rawTask = rawById[index] as Record<string, unknown>

    const rawParent = asString(rawTask.parentId)
    task.parentId =
      rawParent && rawParent !== task.id && taskIds.has(rawParent) ? rawParent : null

    task.dependencies = (Array.isArray(rawTask.dependencies) ? rawTask.dependencies : [])
      .map((dependency) => normalizeDependency(dependency, taskIds))
      .filter((dependency): dependency is Dependency => dependency !== null)
      .filter((dependency) => dependency.predecessorId !== task.id)
      .filter(
        (dependency, position, list) =>
          list.findIndex(
            (other) =>
              other.predecessorId === dependency.predecessorId && other.type === dependency.type,
          ) === position,
      )

    task.assignments = (Array.isArray(rawTask.assignments) ? rawTask.assignments : [])
      .map((assignment) => normalizeAssignment(assignment, resourceIds))
      .filter((assignment): assignment is Assignment => assignment !== null)
  }

  breakParentCycles(tasks)

  return {
    version: DATA_VERSION,
    projectName: asString(input.projectName, 'Proyek'),
    tasks,
    resources,
    calendar: normalizeCalendar(input.calendar),
  }
}

/** Cuts any parent link that would make the task tree cyclic. */
function breakParentCycles(tasks: Task[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  for (const task of tasks) {
    const seen = new Set<string>([task.id])
    let current = task.parentId
    while (current) {
      if (seen.has(current)) {
        task.parentId = null
        break
      }
      seen.add(current)
      current = byId.get(current)?.parentId ?? null
    }
  }
}

export function loadProject(): ProjectData | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeProject(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveProject(project: ProjectData): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  } catch {
    // Quota exceeded or storage disabled: keep running with in-memory state.
  }
}

export function clearStoredProject(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
