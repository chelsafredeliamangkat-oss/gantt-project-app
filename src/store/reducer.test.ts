import { describe, expect, it } from 'vitest'
import { projectReducer } from './reducer'
import { addDays, toISODate } from '../lib/dates'
import { MONDAY, dep, makeProject, makeResource, makeTask } from '../test/factories'

const DAY = (offset: number) => toISODate(addDays(MONDAY, offset))

describe('projectReducer', () => {
  it('deletes a subtree and prunes dependencies pointing into it', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'a' }),
        makeTask({ id: 'b', parentId: 'a' }),
        makeTask({ id: 'c', dependencies: [dep('b')] }),
      ],
    })

    const next = projectReducer(state, { type: 'deleteTask', id: 'a', withChildren: true })

    expect(next.tasks.map((task) => task.id)).toEqual(['c'])
    expect(next.tasks[0]?.dependencies).toEqual([])
  })

  it('reparents children when only the parent is deleted', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'root' }),
        makeTask({ id: 'mid', parentId: 'root' }),
        makeTask({ id: 'leaf', parentId: 'mid' }),
      ],
    })

    const next = projectReducer(state, { type: 'deleteTask', id: 'mid', withChildren: false })

    expect(next.tasks.find((task) => task.id === 'leaf')?.parentId).toBe('root')
  })

  it('releases assignments when a member is removed', () => {
    const state = makeProject({
      resources: [makeResource({ id: 'r1' })],
      tasks: [makeTask({ id: 'a', assignments: [{ resourceId: 'r1', allocation: 50 }] })],
    })

    const next = projectReducer(state, { type: 'deleteResource', id: 'r1' })

    expect(next.resources).toEqual([])
    expect(next.tasks[0]?.assignments).toEqual([])
  })

  it('refuses to empty the working week', () => {
    const state = makeProject()
    const next = projectReducer(state, { type: 'setWorkingDays', workingDays: [] })
    expect(next.calendar.workingDays).toEqual(state.calendar.workingDays)
  })

  it('keeps holidays sorted by date', () => {
    const state = makeProject()
    const withLate = projectReducer(state, {
      type: 'addHoliday',
      holiday: { id: 'h2', date: '2027-01-01', name: 'Natal' },
    })
    const withEarly = projectReducer(withLate, {
      type: 'addHoliday',
      holiday: { id: 'h1', date: '2026-12-25', name: 'Natal' },
    })
    expect(withEarly.calendar.holidays.map((holiday) => holiday.id)).toEqual(['h1', 'h2'])
  })

  it('rejects a parent link that would create a cycle', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'a' }),
        makeTask({ id: 'b', parentId: 'a' }),
      ],
    })

    const next = projectReducer(state, {
      type: 'updateTask',
      id: 'a',
      patch: { parentId: 'b' },
    })

    expect(next.tasks.find((task) => task.id === 'a')?.parentId).toBeNull()
  })

  it('shifts every descendant when a summary task is moved', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'a', duration: 0, startDate: DAY(0) }),
        makeTask({ id: 'b', parentId: 'a', duration: 2, startDate: DAY(0) }),
        makeTask({ id: 'c', parentId: 'a', duration: 2, startDate: DAY(4) }),
      ],
    })

    const next = projectReducer(state, {
      type: 'moveTask',
      id: 'a',
      startDate: DAY(7),
      cascadeChildren: true,
    })

    expect(next.tasks.find((task) => task.id === 'b')?.startDate).toBe(DAY(7))
    expect(next.tasks.find((task) => task.id === 'c')?.startDate).toBe(DAY(11))
  })

  it('moves a single task without touching its siblings', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'a', duration: 2, startDate: DAY(0) }),
        makeTask({ id: 'b', duration: 2, startDate: DAY(4) }),
      ],
    })

    const next = projectReducer(state, {
      type: 'moveTask',
      id: 'b',
      startDate: DAY(7),
    })

    expect(next.tasks.find((task) => task.id === 'a')?.startDate).toBe(DAY(0))
    expect(next.tasks.find((task) => task.id === 'b')?.startDate).toBe(DAY(7))
  })

  it('resizes a task by patching its start date and duration', () => {
    const state = makeProject({ tasks: [makeTask({ id: 'a', duration: 2, startDate: DAY(0) })] })

    const next = projectReducer(state, {
      type: 'moveTask',
      id: 'a',
      startDate: DAY(0),
      duration: 5,
    })

    expect(next.tasks[0]?.duration).toBe(5)
    expect(next.tasks[0]?.startDate).toBe(DAY(0))
  })

  it('never shrinks a duration below one working day', () => {
    const state = makeProject({ tasks: [makeTask({ id: 'a', duration: 3, startDate: DAY(0) })] })

    const next = projectReducer(state, {
      type: 'updateTask',
      id: 'a',
      patch: { duration: 0 },
    })

    expect(next.tasks[0]?.duration).toBe(1)
  })

  it('ignores duration edits on a summary task', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'a', duration: 0 }),
        makeTask({ id: 'b', parentId: 'a', duration: 4 }),
      ],
    })

    const next = projectReducer(state, { type: 'updateTask', id: 'a', patch: { duration: 9 } })

    expect(next.tasks.find((task) => task.id === 'a')?.duration).toBe(0)
  })

  it('duplicates a subtree with fresh ids and kept hierarchy', () => {
    const state = makeProject({
      tasks: [
        makeTask({ id: 'a', name: 'Fase' }),
        makeTask({ id: 'b', parentId: 'a', name: 'Kerja', dependencies: [dep('a')] }),
      ],
    })

    const next = projectReducer(state, { type: 'duplicateTask', id: 'a' })

    expect(next.tasks).toHaveLength(4)
    const clone = next.tasks.find((task) => task.name === 'Fase (salinan)')
    expect(clone).toBeDefined()
    const clonedChild = next.tasks.find(
      (task) => task.parentId === clone?.id && task.name === 'Kerja',
    )
    expect(clonedChild).toBeDefined()
    expect(clonedChild?.dependencies).toEqual([])
  })

  it('replaces the whole project on demand', () => {
    const state = makeProject({ tasks: [makeTask({ id: 'a' })] })
    const next = projectReducer(state, { type: 'replaceProject', project: makeProject() })
    expect(next.tasks).toEqual([])
  })
})
