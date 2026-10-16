import { describe, expect, it } from 'vitest'
import { computeSchedule } from './schedule'
import { addDays, toISODate } from './dates'
import { MONDAY, dep, holiday, makeCalendar, makeTask } from '../test/factories'
import type { Task } from '../types'

const DAY = (offset: number) => toISODate(addDays(MONDAY, offset))

function scheduleOf(tasks: Task[], holidays: string[] = []) {
  return computeSchedule(
    tasks,
    makeCalendar({ holidays: holidays.map((date) => holiday(date)) }),
  )
}

describe('computeSchedule', () => {
  it('returns an empty plan when there are no tasks', () => {
    const result = scheduleOf([])
    expect(result.ok).toBe(true)
    expect(result.projectStart).toBeNull()
    expect(result.criticalPath).toEqual([])
  })

  it('chains finish-to-start successors', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 3 }),
      makeTask({ id: 'b', duration: 2, dependencies: [dep('a')] }),
    ])

    expect(result.byId.get('a')?.startDate).toBe(DAY(0))
    expect(result.byId.get('a')?.finishDate).toBe(DAY(2))
    expect(result.byId.get('b')?.startDate).toBe(DAY(3))
    expect(result.byId.get('b')?.finishDate).toBe(DAY(4))
    expect(result.projectStart).toBe(DAY(0))
    expect(result.projectFinish).toBe(DAY(4))
    expect(result.durationDays).toBe(5)
    expect([...result.criticalPath]).toEqual(['a', 'b'])
    expect(result.byId.get('a')?.totalFloat).toBe(0)
  })

  it('skips weekends inside a task span', () => {
    const result = scheduleOf([makeTask({ id: 'a', duration: 3, startDate: DAY(3) })])
    // Kamis, Jumat, lalu Senin.
    expect(result.byId.get('a')?.finishDate).toBe(DAY(7))
  })

  it('skips custom holidays inside a task span', () => {
    const result = scheduleOf([makeTask({ id: 'a', duration: 3, startDate: DAY(0) })], [
      DAY(1),
    ])
    // Senin, (Selasa libur), Rabu, Kamis.
    expect(result.byId.get('a')?.finishDate).toBe(DAY(3))
  })

  it('applies a finish-to-start lag', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 2 }),
      makeTask({ id: 'b', duration: 2, dependencies: [dep('a', 'FS', 2)] }),
    ])
    // a: Senin-Selasa, jeda 2 hari kerja (Rabu & Kamis), b: Jumat s/d Senin
    expect(result.byId.get('b')?.startDate).toBe(DAY(4))
    expect(result.byId.get('b')?.finishDate).toBe(DAY(7))
    expect(result.criticalPath.length).toBe(2)
  })

  it('applies a start-to-start lag', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 5 }),
      makeTask({ id: 'b', duration: 3, dependencies: [dep('a', 'SS', 2)] }),
    ])
    expect(result.byId.get('b')?.startDate).toBe(DAY(2))
    expect(result.byId.get('b')?.finishDate).toBe(DAY(4))
  })

  it('supports a negative start-to-start lag', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 4 }),
      makeTask({ id: 'b', duration: 2, startDate: DAY(4), dependencies: [dep('a', 'SS', -2)] }),
    ])
    // SS -2 hanya boleh memajukan dari constraint, tidak memundurkannya.
    expect(result.byId.get('b')?.startDate).toBe(DAY(4))
  })

  it('treats startDate as a start-no-earlier-than constraint', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 2 }),
      makeTask({ id: 'b', duration: 2, startDate: DAY(3), dependencies: [dep('a')] }),
    ])
    // b tertahan constraint, sehingga a punya 1 hari float.
    expect(result.byId.get('b')?.startDate).toBe(DAY(3))
    expect(result.byId.get('a')?.totalFloat).toBe(1)
    expect(result.byId.get('b')?.totalFloat).toBe(0)
    expect([...result.criticalPath]).toEqual(['b'])
  })

  it('computes float for a parallel branch', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 2 }),
      makeTask({ id: 'b', duration: 2, dependencies: [dep('a')] }),
      makeTask({ id: 'short', duration: 2 }),
    ])
    // short: Senin-Selasa, tapi proyek selesai Kamis -> float 2 hari.
    expect(result.byId.get('short')?.totalFloat).toBe(2)
    expect(result.byId.get('short')?.critical).toBe(false)
    expect(result.criticalPath).toEqual(['a', 'b'])
  })

  it('marks a task critical when two branches land on the same date', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 3 }),
      makeTask({ id: 'other', duration: 3 }),
    ])
    expect(result.byId.get('a')?.totalFloat).toBe(0)
    expect(result.byId.get('other')?.totalFloat).toBe(0)
  })

  it('derives summary dates from the child envelope', () => {
    const result = scheduleOf([
      makeTask({ id: 'p', duration: 0, parentId: null }),
      makeTask({ id: 'a', duration: 2, parentId: 'p' }),
      makeTask({ id: 'b', duration: 3, parentId: 'p', dependencies: [dep('a')] }),
    ])

    const summary = result.byId.get('p')
    expect(summary?.isSummary).toBe(true)
    expect(summary?.startDate).toBe(DAY(0))
    expect(summary?.finishDate).toBe(DAY(4))
    expect(summary?.duration).toBe(5)
    expect(result.leafIds.sort()).toEqual(['a', 'b'])
    expect(result.criticalPath).toEqual(['a', 'b'])
    expect(summary?.critical).toBe(true)
  })

  it('keeps parent dates in sync down two levels', () => {
    const result = scheduleOf([
      makeTask({ id: 'root', duration: 0 }),
      makeTask({ id: 'mid', duration: 0, parentId: 'root' }),
      makeTask({ id: 'leaf', duration: 2, parentId: 'mid' }),
    ])
    expect(result.byId.get('root')?.startDate).toBe(DAY(0))
    expect(result.byId.get('root')?.finishDate).toBe(DAY(1))
    expect(result.byId.get('mid')?.depth).toBe(1)
    expect(result.byId.get('leaf')?.depth).toBe(2)
  })

  it('detects a circular dependency instead of hanging', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 2, dependencies: [dep('b')] }),
      makeTask({ id: 'b', duration: 2, dependencies: [dep('a')] }),
    ])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('melingkar')
    expect(result.byId.size).toBe(0)
  })

  it('warns about a dependency on a deleted task without failing', () => {
    const result = scheduleOf([
      makeTask({ id: 'a', duration: 2, dependencies: [dep('ghost')] }),
    ])
    expect(result.ok).toBe(true)
    expect(result.warnings.length).toBe(1)
    expect(result.byId.get('a')?.startDate).toBe(DAY(0))
  })

  it('warns and ignores a dependency on a summary task', () => {
    const result = scheduleOf([
      makeTask({ id: 'p', duration: 0 }),
      makeTask({ id: 'child', duration: 2, parentId: 'p' }),
      makeTask({ id: 'other', duration: 2, dependencies: [dep('p')] }),
    ])
    expect(result.warnings.join(' ')).toContain('tugas induk')
    expect(result.byId.get('other')?.startDate).toBe(DAY(0))
  })

  it('fails cleanly when no working day is configured', () => {
    const result = computeSchedule(
      [makeTask({ id: 'a' })],
      makeCalendar({ workingDays: [] }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('hari kerja')
  })

  it('accepts fractional durations from the PERT pass', () => {
    const result = computeSchedule([makeTask({ id: 'a', duration: 4 })], makeCalendar(), {
      durationOf: () => 5.5,
    })
    expect(result.byId.get('a')?.duration).toBe(6)
  })
})
