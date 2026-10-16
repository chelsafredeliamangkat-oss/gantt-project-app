import { PRIORITY_WEIGHT } from '../types'
import type { Task } from '../types'

export type SortMode = 'manual' | 'start' | 'priority'

export interface FlatTask {
  task: Task
  depth: number
  hasChildren: boolean
  childCount: number
  expanded: boolean
}

export interface FlattenOptions {
  collapsed?: ReadonlySet<string>
  sort?: SortMode
}

/** Groups tasks by parent id. Roots (and orphans) land under the `null` key. */
export function buildChildrenMap(tasks: Task[]): Map<string | null, Task[]> {
  const ids = new Set(tasks.map((task) => task.id))
  const map = new Map<string | null, Task[]>()
  for (const task of tasks) {
    const key = task.parentId && ids.has(task.parentId) ? task.parentId : null
    const bucket = map.get(key)
    if (bucket) bucket.push(task)
    else map.set(key, [task])
  }
  return map
}

export function hasChildren(tasks: Task[], taskId: string): boolean {
  return tasks.some((task) => task.parentId === taskId)
}

export function isSummaryTask(tasks: Task[], taskId: string): boolean {
  return hasChildren(tasks, taskId)
}

function sortGroup(tasks: Task[], mode: SortMode): Task[] {
  if (mode === 'manual') return tasks
  const sorted = [...tasks]
  if (mode === 'start') {
    sorted.sort(
      (a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
    )
  } else {
    sorted.sort(
      (a, b) =>
        PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
        a.startDate.localeCompare(b.startDate) ||
        a.name.localeCompare(b.name),
    )
  }
  return sorted
}

/**
 * Flattens the task tree into display rows, honouring collapsed parents.
 * Collapsed branches are excluded; the collapsed parent itself is kept.
 */
export function flattenTasks(tasks: Task[], options: FlattenOptions = {}): FlatTask[] {
  const byParent = buildChildrenMap(tasks)
  const collapsed = options.collapsed ?? new Set<string>()
  const sortMode = options.sort ?? 'manual'
  const rows: FlatTask[] = []
  const visited = new Set<string>()

  const walk = (parentKey: string | null, depth: number): void => {
    const group = sortGroup(byParent.get(parentKey) ?? [], sortMode)
    for (const task of group) {
      if (visited.has(task.id)) continue
      visited.add(task.id)
      const children = byParent.get(task.id) ?? []
      const expanded = !collapsed.has(task.id)
      rows.push({
        task,
        depth,
        hasChildren: children.length > 0,
        childCount: children.length,
        expanded,
      })
      if (children.length > 0 && expanded) walk(task.id, depth + 1)
    }
  }

  walk(null, 0)
  return rows
}

/** Ordered tree rows ignoring collapse state (used for exports and validation). */
export function flattenAll(tasks: Task[]): FlatTask[] {
  return flattenTasks(tasks, {})
}

/** All ids in the subtree rooted at `taskId`, including `taskId` itself. */
export function subtreeIds(tasks: Task[], taskId: string): string[] {
  const byParent = buildChildrenMap(tasks)
  const out: string[] = []
  const stack = [taskId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (seen.has(current)) continue
    seen.add(current)
    out.push(current)
    for (const child of byParent.get(current) ?? []) stack.push(child.id)
  }
  return out
}

/** The chain from a task up to its root, closest ancestor first. */
export function ancestorIds(tasks: Task[], taskId: string): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const ancestors: string[] = []
  let current = byId.get(taskId)?.parentId ?? null
  const seen = new Set<string>([taskId])
  while (current && !seen.has(current)) {
    seen.add(current)
    ancestors.push(current)
    current = byId.get(current)?.parentId ?? null
  }
  return ancestors
}

/** True when `candidateId` is `taskId` or one of its descendants. */
export function isDescendantOf(
  tasks: Task[],
  candidateId: string,
  taskId: string,
): boolean {
  if (candidateId === taskId) return true
  return subtreeIds(tasks, taskId).includes(candidateId)
}

/** Leaf tasks (no children) are the only ones that take part in scheduling. */
export function leafTasks(tasks: Task[]): Task[] {
  const parents = new Set(tasks.map((task) => task.parentId).filter(Boolean) as string[])
  return tasks.filter((task) => !parents.has(task.id))
}

/** Selected task plus every descendant, depth-first. */
export function selectSubtree(tasks: Task[], taskId: string): Task[] {
  const ids = new Set(subtreeIds(tasks, taskId))
  return tasks.filter((task) => ids.has(task.id))
}

/** Would re-parenting `taskId` under `newParentId` create a cycle? */
export function wouldCreateCycle(
  tasks: Task[],
  taskId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false
  if (newParentId === taskId) return true
  return subtreeIds(tasks, taskId).includes(newParentId)
}
