import { useMemo } from 'react'
import { computePert, computeSchedule } from '../lib/schedule'
import type { PertSummary, ScheduleResult } from '../lib/schedule'
import { useProject } from './ProjectContext'

/** CPM result for the current tasks and calendar, recomputed on change. */
export function useSchedule(): ScheduleResult {
  const { project } = useProject()
  return useMemo(
    () => computeSchedule(project.tasks, project.calendar),
    [project.tasks, project.calendar],
  )
}

/** PERT estimate plus a forward pass driven by expected durations. */
export function usePert(): PertSummary {
  const { project } = useProject()
  return useMemo(
    () => computePert(project.tasks, project.calendar),
    [project.tasks, project.calendar],
  )
}
