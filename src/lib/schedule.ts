/**
 * CPM (Critical Path Method) scheduling plus PERT estimates.
 *
 * Model
 * -----
 * - Only *leaf* tasks (tasks without children) are scheduled. Parent tasks are
 *   summaries whose dates are the envelope of their descendants.
 * - `task.startDate` is a hard "start no earlier than" constraint. Predecessor
 *   links may push a task later than its constraint, never earlier.
 * - FS (finish-to-start) with lag L:  start(successor) >= finish(predecessor) + 1 + L
 * - SS (start-to-start)  with lag L:  start(successor) >= start(predecessor) + L
 * - Everything is expressed in working-day ordinals, so a "day" is always a
 *   working day.
 */

import type { CalendarConfig, Dependency, Task } from '../types'
import { createWorkCalendar, type WorkCalendar } from './calendar'
import { parseISODate, toISODate } from './dates'
import { buildChildrenMap, isSummaryTask } from './hierarchy'

export type DependencyType = Dependency['type']

export interface TaskSchedule {
  taskId: string
  name: string
  isSummary: boolean
  depth: number
  /** Working days. Derived from the child envelope for summary tasks. */
  duration: number
  /** Working-day ordinals, inclusive on both ends. */
  startOrdinal: number
  finishOrdinal: number
  startDate: string
  finishDate: string
  /** Distinct from the constraint when a predecessor pushed the task later. */
  constraintOrdinal: number
  earlyStart: number
  earlyFinish: number
  lateStart: number
  lateFinish: number
  /** Slack in working days; 0 means the task is on a critical path. */
  totalFloat: number
  critical: boolean
}

export interface ScheduleResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  calendar: WorkCalendar
  byId: Map<string, TaskSchedule>
  /** Topological order of the scheduled (leaf) tasks. */
  order: string[]
  leafIds: string[]
  projectStart: string | null
  projectFinish: string | null
  /** Working-day length of the whole plan. */
  durationDays: number
  /** One representative critical chain, in order. */
  criticalPath: string[]
  /** Working-day length of the critical chain. */
  criticalDurationDays: number
}

export interface ScheduleOptions {
  /** Overrides the duration used for a task (used by the PERT forward pass). */
  durationOf?: (task: Task) => number
  /** Overrides the start constraint ordinal for a task. */
  startOrdinalOf?: (task: Task) => number
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.round(value))
}

function normalizeLag(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

/**
 * Depth-first search that reports every cycle it can reach. A cycle makes the
 * schedule undefined, so the caller surfaces it instead of looping forever.
 */
function findCycles(ids: string[], successors: Map<string, string[]>): string[][] {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]))
  const stack: string[] = []
  const cycles: string[][] = []

  const visit = (id: string): void => {
    color.set(id, GRAY)
    stack.push(id)
    for (const next of successors.get(id) ?? []) {
      const state = color.get(next)
      if (state === GRAY) {
        const from = stack.indexOf(next)
        if (from >= 0) cycles.push([...stack.slice(from), next])
      } else if (state === WHITE) {
        visit(next)
      }
    }
    stack.pop()
    color.set(id, BLACK)
  }

  for (const id of ids) {
    if (color.get(id) === WHITE) visit(id)
  }
  return cycles
}

export function computeSchedule(
  tasks: Task[],
  calendarConfig: CalendarConfig,
  options: ScheduleOptions = {},
): ScheduleResult {
  const calendar = createWorkCalendar(calendarConfig)
  const errors: string[] = []
  const warnings: string[] = []
  const byId = new Map<string, TaskSchedule>()
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const childrenOf = buildChildrenMap(tasks)

  if (calendar.workingDays.length === 0) {
    errors.push('Tidak ada hari kerja yang dipilih pada kalender proyek.')
    return emptyResult(calendar, errors, warnings)
  }

  const summaryIds = new Set(
    tasks.filter((task) => isSummaryTask(tasks, task.id)).map((task) => task.id),
  )
  const leafIds = tasks.filter((task) => !summaryIds.has(task.id)).map((task) => task.id)

  if (leafIds.length === 0) {
    return emptyResult(calendar, errors, warnings)
  }

  const durationOf = (task: Task): number => {
    const raw = options.durationOf ? options.durationOf(task) : task.duration
    return clampDuration(raw)
  }
  const startOrdinalOf = (task: Task): number => {
    if (options.startOrdinalOf) return options.startOrdinalOf(task)
    return calendar.ordinalOf(parseISODate(task.startDate))
  }

  // Tree depth is used by the UI to indent rows.
  const depthById = new Map<string, number>()
  const assignDepth = (parentKey: string | null, depth: number): void => {
    for (const child of childrenOf.get(parentKey) ?? []) {
      depthById.set(child.id, depth)
      assignDepth(child.id, depth + 1)
    }
  }
  assignDepth(null, 0)

  // Dependency edges, ignoring anything that points at a missing or summary task.
  const predecessors = new Map<string, Dependency[]>()
  const successorEdges = new Map<string, Array<{ taskId: string; dependency: Dependency }>>()
  for (const id of leafIds) {
    predecessors.set(id, [])
    successorEdges.set(id, [])
  }
  for (const task of tasks) {
    if (summaryIds.has(task.id)) continue
    for (const dependency of task.dependencies) {
      const source = taskById.get(dependency.predecessorId)
      if (!source) {
        warnings.push(
          `Tugas "${task.name}" memiliki pendahulu yang sudah dihapus; keterkaitan diabaikan.`,
        )
        continue
      }
      if (summaryIds.has(source.id)) {
        warnings.push(
          `Pendahulu "${source.name}" adalah tugas induk (ringkasan); keterkaitan ke "${task.name}" diabaikan.`,
        )
        continue
      }
      if (source.id === task.id) {
        errors.push(`Tugas "${task.name}" tidak boleh bergantung pada dirinya sendiri.`)
        continue
      }
      ;(predecessors.get(task.id) as Dependency[]).push(dependency)
      successorEdges.get(source.id)?.push({ taskId: task.id, dependency })
    }
  }

  // Each entry keeps the successor's own id so the backward pass stays readable.
  const successorIds = new Map<string, string[]>()
  for (const id of leafIds) {
    successorIds.set(
      id,
      (successorEdges.get(id) ?? []).map((edge) => edge.taskId),
    )
  }

  const cycles = findCycles(leafIds, successorIds)
  if (cycles.length > 0) {
    const readable = cycles
      .map((cycle) => cycle.map((id) => taskById.get(id)?.name ?? id).join(' → '))
      .join('; ')
    errors.push(`Terdeteksi ketergantungan melingkar: ${readable}`)
    return emptyResult(calendar, errors, warnings)
  }

  // Kahn's algorithm gives a dependency-respecting order for the forward pass.
  const indegree = new Map<string, number>()
  for (const id of leafIds) indegree.set(id, (predecessors.get(id) ?? []).length)
  const queue = leafIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift() as string
    order.push(id)
    for (const next of successorIds.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 1) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  // ---- Forward pass -------------------------------------------------------
  const earlyStart = new Map<string, number>()
  const earlyFinish = new Map<string, number>()
  const constraint = new Map<string, number>()
  const duration = new Map<string, number>()

  for (const id of order) {
    const task = taskById.get(id) as Task
    const ownDuration = durationOf(task)
    duration.set(id, ownDuration)
    const ownStart = startOrdinalOf(task)
    constraint.set(id, ownStart)

    let start = ownStart
    for (const dependency of predecessors.get(id) ?? []) {
      const lag = normalizeLag(dependency.lag)
      const predecessorStart = earlyStart.get(dependency.predecessorId)
      const predecessorFinish = earlyFinish.get(dependency.predecessorId)
      if (predecessorStart === undefined || predecessorFinish === undefined) continue
      const required =
        dependency.type === 'SS' ? predecessorStart + lag : predecessorFinish + 1 + lag
      if (required > start) start = required
    }
    // `start` is already snapped: an ordinal always names a working day.
    earlyStart.set(id, start)
    earlyFinish.set(id, start + ownDuration - 1)
  }

  let projectStartOrdinal = Number.POSITIVE_INFINITY
  let projectFinishOrdinal = Number.NEGATIVE_INFINITY
  for (const id of order) {
    projectStartOrdinal = Math.min(projectStartOrdinal, earlyStart.get(id) as number)
    projectFinishOrdinal = Math.max(projectFinishOrdinal, earlyFinish.get(id) as number)
  }

  // ---- Backward pass ------------------------------------------------------
  const lateStart = new Map<string, number>()
  const lateFinish = new Map<string, number>()
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const id = order[index] as string
    const ownDuration = duration.get(id) as number
    let limitFinish = projectFinishOrdinal
    let limitStart = projectFinishOrdinal - ownDuration + 1

    for (const edge of successorEdges.get(id) ?? []) {
      const successorLateStart = lateStart.get(edge.taskId)
      if (successorLateStart === undefined) continue
      const lag = normalizeLag(edge.dependency.lag)
      if (edge.dependency.type === 'SS') {
        limitStart = Math.min(limitStart, successorLateStart - lag)
      } else {
        limitFinish = Math.min(limitFinish, successorLateStart - 1 - lag)
      }
    }
    limitStart = Math.min(limitStart, limitFinish - ownDuration + 1)
    lateFinish.set(id, limitFinish)
    lateStart.set(id, limitStart)
  }

  const criticalIds = new Set<string>()
  for (const id of order) {
    const task = taskById.get(id) as Task
    const es = earlyStart.get(id) as number
    const ef = earlyFinish.get(id) as number
    const ls = lateStart.get(id) as number
    const lf = lateFinish.get(id) as number
    const totalFloat = ls - es
    const critical = totalFloat === 0
    if (critical) criticalIds.add(id)
    byId.set(id, {
      taskId: id,
      name: task.name,
      isSummary: false,
      depth: depthById.get(id) ?? 0,
      duration: duration.get(id) as number,
      startOrdinal: es,
      finishOrdinal: ef,
      startDate: toISODate(calendar.dateOfOrdinal(es)),
      finishDate: toISODate(calendar.dateOfOrdinal(ef)),
      constraintOrdinal: constraint.get(id) as number,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      critical,
    })
  }

  // ---- Summary (parent) envelopes ----------------------------------------
  // Built bottom-up so a parent sees its children's envelopes, and a summary is
  // flagged critical when any of its descendants is.
  const buildSummary = (task: Task, depth: number): { start: number; finish: number } | null => {
    const children = childrenOf.get(task.id) ?? []
    if (children.length === 0) return null

    let start = Number.POSITIVE_INFINITY
    let finish = Number.NEGATIVE_INFINITY
    let anyCritical = false
    let found = false

    for (const child of children) {
      const childSummary = buildSummary(child, depth + 1)
      const childSchedule =
        childSummary ??
        (() => {
          const leaf = byId.get(child.id)
          return leaf ? { start: leaf.startOrdinal, finish: leaf.finishOrdinal } : null
        })()

      if (childSchedule) {
        start = Math.min(start, childSchedule.start)
        finish = Math.max(finish, childSchedule.finish)
        found = true
      }
      if (isCriticalInSubtree(child.id)) anyCritical = true
    }

    if (!found) return null

    const critical = anyCritical
    if (critical) criticalIds.add(task.id)

    byId.set(task.id, {
      taskId: task.id,
      name: task.name,
      isSummary: true,
      depth: depthById.get(task.id) ?? depth,
      duration: finish - start + 1,
      startOrdinal: start,
      finishOrdinal: finish,
      startDate: toISODate(calendar.dateOfOrdinal(start)),
      finishDate: toISODate(calendar.dateOfOrdinal(finish)),
      constraintOrdinal: start,
      earlyStart: start,
      earlyFinish: finish,
      lateStart: start,
      lateFinish: finish,
      totalFloat: 0,
      critical,
    })

    return { start, finish }
  }

  /** True when the task itself, or any of its descendants, is on a critical path. */
  function isCriticalInSubtree(taskId: string): boolean {
    if (criticalIds.has(taskId)) return true
    const stack = [...(childrenOf.get(taskId) ?? []).map((child) => child.id)]
    while (stack.length > 0) {
      const current = stack.pop() as string
      if (criticalIds.has(current)) return true
      for (const child of childrenOf.get(current) ?? []) stack.push(child.id)
    }
    return false
  }

  for (const root of childrenOf.get(null) ?? []) {
    if (isSummaryTask(tasks, root.id)) buildSummary(root, 0)
  }

  // ---- Representative critical path --------------------------------------
  const criticalPath = extractCriticalPath(
    order,
    criticalIds,
    earlyStart,
    earlyFinish,
    predecessors,
  )
  // The chain only ever contains leaf tasks.
  const criticalDurationDays = criticalPath.reduce(
    (total, id) => total + (duration.get(id) ?? 0),
    0,
  )

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    calendar,
    byId,
    order,
    leafIds,
    projectStart: toISODate(calendar.dateOfOrdinal(projectStartOrdinal)),
    projectFinish: toISODate(calendar.dateOfOrdinal(projectFinishOrdinal)),
    durationDays: projectFinishOrdinal - projectStartOrdinal + 1,
    criticalPath,
    criticalDurationDays,
  }
}

/** Longest chain of critical tasks that is actually driven by its predecessors. */
function extractCriticalPath(
  order: string[],
  criticalIds: Set<string>,
  earlyStart: Map<string, number>,
  earlyFinish: Map<string, number>,
  predecessors: Map<string, Dependency[]>,
): string[] {
  const criticalOrder = order.filter((id) => criticalIds.has(id))
  if (criticalOrder.length === 0) return []

  const nextCritical = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const id of criticalOrder) {
    nextCritical.set(id, [])
    inDegree.set(id, 0)
  }

  for (const successorId of criticalOrder) {
    for (const dependency of predecessors.get(successorId) ?? []) {
      const predecessorId = dependency.predecessorId
      if (!criticalIds.has(predecessorId)) continue
      const lag = normalizeLag(dependency.lag)
      const required =
        dependency.type === 'SS'
          ? (earlyStart.get(predecessorId) as number) + lag
          : (earlyFinish.get(predecessorId) as number) + 1 + lag
      const successorStart = earlyStart.get(successorId) as number
      if (required !== successorStart) continue
      nextCritical.get(predecessorId)?.push(successorId)
      inDegree.set(successorId, (inDegree.get(successorId) as number) + 1)
    }
  }

  const memo = new Map<string, string[]>()
  const longest = (id: string): string[] => {
    const cached = memo.get(id)
    if (cached) return cached
    let best: string[] = [id]
    for (const next of nextCritical.get(id) ?? []) {
      const candidate = [id, ...longest(next)]
      if (candidate.length > best.length) best = candidate
    }
    memo.set(id, best)
    return best
  }

  let best: string[] = []
  for (const id of criticalOrder) {
    if ((inDegree.get(id) ?? 0) > 0) continue
    const candidate = longest(id)
    if (candidate.length > best.length) best = candidate
  }
  if (best.length === 0) {
    for (const id of criticalOrder) {
      const candidate = longest(id)
      if (candidate.length > best.length) best = candidate
    }
  }
  return best
}

function emptyResult(
  calendar: WorkCalendar,
  errors: string[],
  warnings: string[],
): ScheduleResult {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    calendar,
    byId: new Map(),
    order: [],
    leafIds: [],
    projectStart: null,
    projectFinish: null,
    durationDays: 0,
    criticalPath: [],
    criticalDurationDays: 0,
  }
}

// ---------------------------------------------------------------------------
// PERT
// ---------------------------------------------------------------------------

export interface PertEstimate {
  taskId: string
  optimistic: number
  mostLikely: number
  pessimistic: number
  /** Expected duration (te) in working days as a fractional number. */
  expected: number
  /** Standard deviation ((p - o) / 6). */
  standardDeviation: number
  /** Variance (sd squared); variances add along a path. */
  variance: number
}

export function pertEstimate(task: Task): PertEstimate {
  const duration = clampDuration(task.duration)
  const mostLikely = clampDuration(task.mostLikely ?? duration)

  const rawOptimistic = task.optimistic ?? Math.max(1, Math.round(mostLikely * 0.8))
  const rawPessimistic = task.pessimistic ?? Math.round(mostLikely * 1.5)

  const optimistic = clampDuration(Math.min(rawOptimistic, mostLikely))
  const pessimistic = clampDuration(Math.max(rawPessimistic, mostLikely))

  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6
  const standardDeviation = (pessimistic - optimistic) / 6

  return {
    taskId: task.id,
    optimistic,
    mostLikely,
    pessimistic,
    expected,
    standardDeviation,
    variance: standardDeviation * standardDeviation,
  }
}

export function pertEstimates(tasks: Task[]): Map<string, PertEstimate> {
  return new Map(tasks.map((task) => [task.id, pertEstimate(task)]))
}

export interface PertSummary {
  estimates: Map<string, PertEstimate>
  /** Forward pass using expected durations instead of the deterministic ones. */
  schedule: ScheduleResult
  /** Expected project length along the critical chain, as a fraction of days. */
  expectedDuration: number
  /** Standard deviation of the critical chain. */
  projectStandardDeviation: number
  /** Probability of finishing within the deterministic plan. */
  probabilityWithinPlan: number
}

export function computePert(tasks: Task[], calendarConfig: CalendarConfig): PertSummary {
  const estimates = pertEstimates(tasks)
  const schedule = computeSchedule(tasks, calendarConfig, {
    durationOf: (task) => estimates.get(task.id)?.expected ?? task.duration,
  })

  let expectedDuration = 0
  let variance = 0
  for (const id of schedule.criticalPath) {
    const estimate = estimates.get(id)
    if (!estimate) continue
    expectedDuration += estimate.expected
    variance += estimate.variance
  }

  const projectStandardDeviation = Math.sqrt(variance)
  const deterministic = schedule.criticalDurationDays
  const probabilityWithinPlan =
    projectStandardDeviation > 0
      ? normalCdf((deterministic - expectedDuration) / projectStandardDeviation)
      : 1

  return {
    estimates,
    schedule,
    expectedDuration,
    projectStandardDeviation,
    probabilityWithinPlan,
  }
}

/** Standard normal cumulative distribution (Abramowitz & Stegun 26.2.17). */
export function normalCdf(z: number): number {
  if (z < -8) return 0
  if (z > 8) return 1
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly =
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const pdf = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)
  const cdf = 1 - pdf * poly
  return z >= 0 ? cdf : 1 - cdf
}
