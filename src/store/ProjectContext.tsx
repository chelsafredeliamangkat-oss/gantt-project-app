import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { ProjectData } from '../types'
import { createEmptyProject, createSeedProject } from '../lib/seed'
import { loadProject, saveProject } from '../lib/storage'
import { projectReducer, type ProjectAction } from './reducer'

export interface ProjectContextValue {
  project: ProjectData
  dispatch: Dispatch<ProjectAction>
  selectedTaskId: string | null
  selectTask: (taskId: string | null) => void
  resetToSeed: () => void
  clearAll: () => void
  /** Timestamp of the last localStorage write, for the status bar. */
  savedAt: number | null
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

function createInitialProject(): ProjectData {
  return loadProject() ?? createSeedProject()
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, dispatch] = useReducer(projectReducer, undefined, createInitialProject)
  const [requestedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    saveProject(project)
    setSavedAt(Date.now())
  }, [project])

  // Deriving the selection means a deleted task can never stay selected.
  const selectedTaskId = useMemo(
    () =>
      requestedTaskId && project.tasks.some((task) => task.id === requestedTaskId)
        ? requestedTaskId
        : null,
    [requestedTaskId, project.tasks],
  )

  const selectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId)
  }, [])

  const resetToSeed = useCallback(() => {
    dispatch({ type: 'replaceProject', project: createSeedProject() })
    setSelectedTaskId(null)
  }, [])

  const projectName = project.projectName
  const clearAll = useCallback(() => {
    dispatch({ type: 'replaceProject', project: createEmptyProject(projectName) })
    setSelectedTaskId(null)
  }, [projectName])

  const value = useMemo<ProjectContextValue>(
    () => ({
      project,
      dispatch,
      selectedTaskId,
      selectTask,
      resetToSeed,
      clearAll,
      savedAt,
    }),
    [project, selectedTaskId, selectTask, resetToSeed, clearAll, savedAt],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject harus dipakai di dalam <ProjectProvider>')
  }
  return context
}
