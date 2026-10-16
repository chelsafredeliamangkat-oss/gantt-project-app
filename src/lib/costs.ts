import { WORKING_DAYS_PER_MONTH } from '../types'
import type { Resource, Task } from '../types'

export interface ResourceUsage {
  resourceId: string
  /** Number of distinct leaf tasks the member is allocated to. */
  taskCount: number
  /** Person-days: duration x allocation. */
  effortDays: number
  cost: number
  /** Effort as a share of the project's working days. */
  utilization: number
  tasks: Array<{ taskId: string; name: string; allocation: number; effortDays: number; cost: number }>
}

export interface CostSummary {
  rows: ResourceUsage[]
  totalCost: number
  totalEffortDays: number
}

/** Monthly salary spread over the assumed number of working days in a month. */
export function dailyRate(resource: Resource): number {
  return resource.salary / WORKING_DAYS_PER_MONTH
}

export function allocationEffort(durationDays: number, allocation: number): number {
  return (durationDays * allocation) / 100
}

/**
 * Aggregates effort and cost per member. Only leaf tasks are counted, so a
 * summary task never doubles its children's cost.
 */
export function computeCosts(
  tasks: Task[],
  resources: Resource[],
  durationOfTask: (taskId: string) => number,
  projectWorkingDays: number,
): CostSummary {
  const parentIds = new Set(
    tasks.map((task) => task.parentId).filter((id): id is string => Boolean(id)),
  )
  const byId = new Map(resources.map((resource) => [resource.id, resource]))
  const rows = new Map<string, ResourceUsage>(
    resources.map((resource) => [
      resource.id,
      {
        resourceId: resource.id,
        taskCount: 0,
        effortDays: 0,
        cost: 0,
        utilization: 0,
        tasks: [],
      },
    ]),
  )

  for (const task of tasks) {
    if (parentIds.has(task.id)) continue
    const duration = Math.max(1, durationOfTask(task.id))
    for (const assignment of task.assignments) {
      const resource = byId.get(assignment.resourceId)
      const row = rows.get(assignment.resourceId)
      if (!resource || !row) continue
      const effortDays = allocationEffort(duration, assignment.allocation)
      const cost = dailyRate(resource) * effortDays
      row.taskCount += 1
      row.effortDays += effortDays
      row.cost += cost
      row.tasks.push({ taskId: task.id, name: task.name, allocation: assignment.allocation, effortDays, cost })
    }
  }

  const list = [...rows.values()]
  for (const row of list) {
    row.utilization = projectWorkingDays > 0 ? row.effortDays / projectWorkingDays : 0
    row.tasks.sort((a, b) => a.name.localeCompare(b.name))
  }
  list.sort((a, b) => b.cost - a.cost)

  return {
    rows: list,
    totalCost: list.reduce((total, row) => total + row.cost, 0),
    totalEffortDays: list.reduce((total, row) => total + row.effortDays, 0),
  }
}

/** Cost of a single task: its duration spread over its assigned members. */
export function taskCost(
  task: Task,
  resources: Resource[],
  durationDays: number,
): number {
  const byId = new Map(resources.map((resource) => [resource.id, resource]))
  return task.assignments.reduce((total, assignment) => {
    const resource = byId.get(assignment.resourceId)
    if (!resource) return total
    return total + dailyRate(resource) * allocationEffort(durationDays, assignment.allocation)
  }, 0)
}

/** Tasks that a member is allocated to, in schedule order. */
export function resourceTasks(tasks: Task[], resourceId: string): Task[] {
  return tasks.filter((task) =>
    task.assignments.some((assignment) => assignment.resourceId === resourceId),
  )
}
