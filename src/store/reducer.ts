import type {
  CalendarConfig,
  Dependency,
  Holiday,
  ProjectData,
  Resource,
  Task,
} from '../types'
import { createWorkCalendar } from '../lib/calendar'
import { parseISODate, toISODate } from '../lib/dates'
import { hasChildren, subtreeIds, wouldCreateCycle } from '../lib/hierarchy'
import { createId } from '../lib/id'

export type ProjectAction =
  | { type: 'setProjectName'; name: string }
  | { type: 'addTask'; task: Task }
  | { type: 'updateTask'; id: string; patch: Partial<Task> }
  | { type: 'deleteTask'; id: string; withChildren: boolean }
  | { type: 'duplicateTask'; id: string }
  | { type: 'addDependency'; taskId: string; dependency: Dependency }
  | {
      type: 'updateDependency'
      taskId: string
      dependencyId: string
      patch: Partial<Dependency>
    }
  | { type: 'removeDependency'; taskId: string; dependencyId: string }
  | { type: 'addResource'; resource: Resource }
  | { type: 'updateResource'; id: string; patch: Partial<Resource> }
  | { type: 'deleteResource'; id: string }
  | { type: 'setWorkingDays'; workingDays: number[] }
  | { type: 'addHoliday'; holiday: Holiday }
  | { type: 'updateHoliday'; id: string; patch: Partial<Holiday> }
  | { type: 'removeHoliday'; id: string }
  | {
      type: 'moveTask'
      id: string
      startDate: string
      duration?: number
      /** Also shifts every descendant by the same number of working days. */
      cascadeChildren?: boolean
    }
  | { type: 'setProgress'; id: string; progress: number }
  | { type: 'replaceProject'; project: ProjectData }

/** Strips every dependency that points at a task that no longer exists. */
function pruneDependencies(tasks: Task[], removed: Set<string>): Task[] {
  return tasks.map((task) => {
    const dependencies = task.dependencies.filter(
      (dependency) => !removed.has(dependency.predecessorId),
    )
    return dependencies.length === task.dependencies.length
      ? task
      : { ...task, dependencies }
  })
}

export function projectReducer(state: ProjectData, action: ProjectAction): ProjectData {
  switch (action.type) {
    case 'setProjectName':
      return { ...state, projectName: action.name }

    case 'addTask':
      return { ...state, tasks: [...state.tasks, action.task] }

    case 'updateTask': {
      const current = state.tasks.find((task) => task.id === action.id)
      if (!current) return state
      const patch = { ...action.patch }
      if (patch.parentId !== undefined && patch.parentId !== null) {
        // Guard against a task becoming its own ancestor.
        if (wouldCreateCycle(state.tasks, action.id, patch.parentId)) delete patch.parentId
      }
      if (patch.duration !== undefined) {
        patch.duration = hasChildren(state.tasks, action.id)
          ? current.duration
          : Math.max(1, Math.round(patch.duration))
      }
      if (patch.progress !== undefined) {
        patch.progress = Math.min(100, Math.max(0, Math.round(patch.progress)))
      }
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, ...patch } : task,
        ),
      }
    }

    case 'setProgress': {
      const progress = Math.min(100, Math.max(0, Math.round(action.progress)))
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, progress } : task,
        ),
      }
    }

    case 'deleteTask': {
      const target = state.tasks.find((task) => task.id === action.id)
      if (!target) return state

      const removed = action.withChildren
        ? new Set(subtreeIds(state.tasks, action.id))
        : new Set([action.id])

      let tasks = state.tasks.filter((task) => !removed.has(task.id))
      if (!action.withChildren) {
        // Orphans move up to the deleted task's parent instead of disappearing.
        tasks = tasks.map((task) =>
          task.parentId === action.id ? { ...task, parentId: target.parentId } : task,
        )
      }
      return { ...state, tasks: pruneDependencies(tasks, removed) }
    }

    case 'duplicateTask': {
      const source = state.tasks.find((task) => task.id === action.id)
      if (!source) return state
      const idMap = new Map<string, string>()
      for (const taskId of subtreeIds(state.tasks, action.id)) {
        idMap.set(taskId, createId('t'))
      }
      const clones: Task[] = state.tasks
        .filter((task) => idMap.has(task.id))
        .map((task) => {
          const cloneId = idMap.get(task.id) as string
          const parentId = task.parentId ? (idMap.get(task.parentId) ?? task.parentId) : null
          return {
            ...task,
            id: cloneId,
            name: task.id === action.id ? `${task.name} (salinan)` : task.name,
            parentId,
            progress: 0,
            dependencies: task.dependencies
              .filter((dependency) => !idMap.has(dependency.predecessorId))
              .map((dependency) => ({ ...dependency, id: createId('d') })),
            assignments: task.assignments.map((assignment) => ({ ...assignment })),
          }
        })
      return { ...state, tasks: [...state.tasks, ...clones] }
    }

    case 'addDependency': {
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? { ...task, dependencies: [...task.dependencies, action.dependency] }
            : task,
        ),
      }
    }

    case 'updateDependency': {
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
                ...task,
                dependencies: task.dependencies.map((dependency) =>
                  dependency.id === action.dependencyId
                    ? { ...dependency, ...action.patch }
                    : dependency,
                ),
              }
            : task,
        ),
      }
    }

    case 'removeDependency': {
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
                ...task,
                dependencies: task.dependencies.filter(
                  (dependency) => dependency.id !== action.dependencyId,
                ),
              }
            : task,
        ),
      }
    }

    case 'addResource':
      return { ...state, resources: [...state.resources, action.resource] }

    case 'updateResource':
      return {
        ...state,
        resources: state.resources.map((resource) =>
          resource.id === action.id ? { ...resource, ...action.patch } : resource,
        ),
      }

    case 'deleteResource': {
      return {
        ...state,
        resources: state.resources.filter((resource) => resource.id !== action.id),
        tasks: state.tasks.map((task) => ({
          ...task,
          assignments: task.assignments.filter(
            (assignment) => assignment.resourceId !== action.id,
          ),
        })),
      }
    }

    case 'setWorkingDays': {
      const workingDays = [...new Set(action.workingDays)]
        .filter((day) => day >= 0 && day <= 6)
        .sort((a, b) => a - b)
      if (workingDays.length === 0) return state
      return { ...state, calendar: { ...state.calendar, workingDays } }
    }

    case 'addHoliday': {
      const calendar: CalendarConfig = {
        ...state.calendar,
        holidays: [...state.calendar.holidays, action.holiday].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      }
      return { ...state, calendar }
    }

    case 'updateHoliday': {
      const calendar: CalendarConfig = {
        ...state.calendar,
        holidays: state.calendar.holidays
          .map((holiday) =>
            holiday.id === action.id ? { ...holiday, ...action.patch } : holiday,
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
      return { ...state, calendar }
    }

    case 'removeHoliday': {
      return {
        ...state,
        calendar: {
          ...state.calendar,
          holidays: state.calendar.holidays.filter(
            (holiday) => holiday.id !== action.id,
          ),
        },
      }
    }

    case 'moveTask': {
      const target = state.tasks.find((task) => task.id === action.id)
      if (!target) return state

      const calendar = createWorkCalendar(state.calendar)
      // Moving is expressed in working days so a drag across a weekend does not
      // add phantom days to the descendants of a summary task.
      const targetOrdinal = calendar.ordinalOf(parseISODate(action.startDate))
      const delta = targetOrdinal - calendar.ordinalOf(parseISODate(target.startDate))
      if (delta === 0 && action.duration === undefined) return state

      const affected = action.cascadeChildren
        ? new Set(subtreeIds(state.tasks, action.id))
        : new Set([action.id])
      const targetIsSummary = hasChildren(state.tasks, action.id)

      const tasks = state.tasks.map((task) => {
        if (!affected.has(task.id)) return task
        const ordinal =
          task.id === action.id
            ? targetOrdinal
            : calendar.ordinalOf(parseISODate(task.startDate)) + delta
        const startDate = toISODate(calendar.dateOfOrdinal(ordinal))

        if (task.id === action.id && action.duration !== undefined && !targetIsSummary) {
          return {
            ...task,
            startDate,
            duration: Math.max(1, Math.round(action.duration)),
          }
        }
        return { ...task, startDate }
      })

      return { ...state, tasks }
    }

    case 'replaceProject':
      return action.project

    default:
      return state
  }
}

export function findTask(state: ProjectData, taskId: string | null): Task | null {
  if (!taskId) return null
  return state.tasks.find((task) => task.id === taskId) ?? null
}
