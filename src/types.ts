/** Domain model for the Gantt project management app. */

export type Priority = 'low' | 'medium' | 'high'

/** Finish-to-Start or Start-to-Start precedence. */
export type DependencyType = 'FS' | 'SS'

export interface Dependency {
  id: string
  predecessorId: string
  type: DependencyType
  /** Lag (jeda) in working days. May be negative. */
  lag: number
}

export interface Assignment {
  resourceId: string
  /** Allocation in percent of the assigned member's working time (1-100). */
  allocation: number
}

export interface Task {
  id: string
  name: string
  description: string
  /** Duration in working days. Derived (and ignored) for summary tasks. */
  duration: number
  /** Constraint start date (yyyy-MM-dd). Interpreted as "start no earlier than". */
  startDate: string
  priority: Priority
  /** Bar indicator colour (hex). */
  color: string
  /** 0-100 */
  progress: number
  /** Parent task id for sub-tasks, or null for a top level task. */
  parentId: string | null
  dependencies: Dependency[]
  assignments: Assignment[]
  /** PERT estimates in working days; null means "derived from duration". */
  optimistic: number | null
  mostLikely: number | null
  pessimistic: number | null
}

export interface Resource {
  id: string
  name: string
  email: string
  role: string
  /** Monthly gross salary in IDR. */
  salary: number
  color: string
}

export interface Holiday {
  id: string
  /** yyyy-MM-dd */
  date: string
  name: string
}

export interface CalendarConfig {
  /** Working weekdays, 0 = Sunday ... 6 = Saturday. */
  workingDays: number[]
  holidays: Holiday[]
}

export interface ProjectData {
  version: number
  projectName: string
  tasks: Task[]
  resources: Resource[]
  calendar: CalendarConfig
}

export const DATA_VERSION = 1

export const STORAGE_KEY = 'gantt-project-app:data:v1'

export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]

export const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export const WEEKDAY_FULL_LABELS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
]

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high']

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

/** Working days assumed per month when converting a monthly salary to a daily rate. */
export const WORKING_DAYS_PER_MONTH = 22

export const TASK_COLORS = [
  '#2563eb',
  '#0891b2',
  '#059669',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#c026d3',
  '#7c3aed',
  '#475569',
  '#0d9488',
]

export const RESOURCE_COLORS = [
  '#2563eb',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#f59e0b',
  '#7c3aed',
  '#0f766e',
  '#b91c1c',
]
