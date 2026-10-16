import { useMemo } from 'react'
import { computeCosts } from '../lib/costs'
import type { CostSummary } from '../lib/costs'
import { useProject } from './ProjectContext'
import { useSchedule } from './useSchedule'

/** Effort and salary cost per member, recomputed when the plan changes. */
export function useCosts(): CostSummary {
  const { project } = useProject()
  const schedule = useSchedule()

  return useMemo(
    () =>
      computeCosts(
        project.tasks,
        project.resources,
        (taskId) => schedule.byId.get(taskId)?.duration ?? 1,
        schedule.durationDays,
      ),
    [project.tasks, project.resources, schedule],
  )
}
