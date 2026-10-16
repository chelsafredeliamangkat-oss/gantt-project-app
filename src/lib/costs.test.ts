import { describe, expect, it } from 'vitest'
import { allocationEffort, computeCosts, dailyRate } from './costs'
import { makeResource, makeTask } from '../test/factories'

describe('dailyRate', () => {
  it('spreads the monthly salary over 22 working days', () => {
    expect(dailyRate(makeResource({ id: 'r', salary: 22_000_000 }))).toBe(1_000_000)
  })
})

describe('allocationEffort', () => {
  it('scales the duration by the allocation percentage', () => {
    expect(allocationEffort(10, 50)).toBe(5)
    expect(allocationEffort(3, 100)).toBe(3)
  })
})

describe('computeCosts', () => {
  it('aggregates effort and cost per resource and skips summary tasks', () => {
    const tasks = [
      makeTask({ id: 'parent', duration: 0 }),
      makeTask({
        id: 'a',
        duration: 4,
        parentId: 'parent',
        assignments: [
          { resourceId: 'r1', allocation: 100 },
          { resourceId: 'r2', allocation: 50 },
        ],
      }),
      makeTask({ id: 'b', duration: 2, assignments: [{ resourceId: 'r1', allocation: 50 }] }),
    ]
    const resources = [
      makeResource({ id: 'r1', salary: 22_000_000 }),
      makeResource({ id: 'r2', salary: 11_000_000 }),
    ]

    const summary = computeCosts(tasks, resources, (id) => (id === 'a' ? 4 : 2), 10)
    const r1 = summary.rows.find((row) => row.resourceId === 'r1')
    const r2 = summary.rows.find((row) => row.resourceId === 'r2')

    expect(r1?.taskCount).toBe(2)
    expect(r1?.effortDays).toBe(5) // 4 x 100% + 2 x 50%
    expect(r1?.cost).toBe(5_000_000)
    expect(r2?.effortDays).toBe(2) // 4 x 50%
    expect(r2?.cost).toBe(1_000_000)
    expect(summary.totalCost).toBe(6_000_000)
    expect(summary.rows[0]?.resourceId).toBe('r1')
    expect(r1?.utilization).toBeCloseTo(0.5, 6)
  })

  it('ignores assignments pointing at a deleted resource', () => {
    const tasks = [
      makeTask({ id: 'a', duration: 2, assignments: [{ resourceId: 'ghost', allocation: 100 }] }),
    ]
    const summary = computeCosts(tasks, [], () => 2, 10)
    expect(summary.totalCost).toBe(0)
  })
})
