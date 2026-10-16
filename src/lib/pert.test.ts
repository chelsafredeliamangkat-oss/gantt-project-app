import { describe, expect, it } from 'vitest'
import { computePert, normalCdf, pertEstimate } from './schedule'
import { addDays, toISODate } from './dates'
import { MONDAY, dep, makeCalendar, makeTask } from '../test/factories'

const DAY = (offset: number) => toISODate(addDays(MONDAY, offset))

describe('pertEstimate', () => {
  it('uses the classic three-point formulas', () => {
    const estimate = pertEstimate(
      makeTask({ id: 'a', duration: 4, optimistic: 2, mostLikely: 4, pessimistic: 6 }),
    )
    expect(estimate.expected).toBeCloseTo(4, 6) // (2 + 16 + 6) / 6
    expect(estimate.standardDeviation).toBeCloseTo(4 / 6, 6)
    expect(estimate.variance).toBeCloseTo(4 / 9, 6)
  })

  it('derives estimates from the duration when they are missing', () => {
    const estimate = pertEstimate(makeTask({ id: 'a', duration: 10 }))
    expect(estimate.optimistic).toBe(8)
    expect(estimate.pessimistic).toBe(15)
    expect(estimate.expected).toBeCloseTo((8 + 40 + 15) / 6, 6)
  })

  it('repairs out-of-order estimates instead of producing a negative deviation', () => {
    const estimate = pertEstimate(
      makeTask({ id: 'a', duration: 5, optimistic: 9, mostLikely: 5, pessimistic: 2 }),
    )
    expect(estimate.optimistic).toBe(5)
    expect(estimate.pessimistic).toBe(5)
    expect(estimate.standardDeviation).toBe(0)
  })
})

describe('computePert', () => {
  it('sums expected durations and variances along the critical path', () => {
    const tasks = [
      makeTask({ id: 'a', duration: 4, optimistic: 2, mostLikely: 4, pessimistic: 6 }),
      makeTask({
        id: 'b',
        duration: 5,
        optimistic: 3,
        mostLikely: 5,
        pessimistic: 7,
        dependencies: [dep('a')],
      }),
    ]
    const summary = computePert(tasks, makeCalendar())

    expect(summary.schedule.criticalPath).toEqual(['a', 'b'])
    expect(summary.expectedDuration).toBeCloseTo(4 + 5, 6)
    expect(summary.projectStandardDeviation).toBeCloseTo(Math.sqrt(4 / 9 + 4 / 9), 6)
    // Expected and deterministic length are both 9 days, so z = 0.
    expect(summary.probabilityWithinPlan).toBeCloseTo(0.5, 6)
  })

  it('reports ~100% confidence when there is no uncertainty', () => {
    const tasks = [
      makeTask({ id: 'a', duration: 3, optimistic: 3, mostLikely: 3, pessimistic: 3 }),
    ]
    const summary = computePert(tasks, makeCalendar())
    expect(summary.projectStandardDeviation).toBe(0)
    expect(summary.probabilityWithinPlan).toBe(1)
  })

  it('produces the same plan as the deterministic pass when te equals duration', () => {
    const tasks = [
      makeTask({ id: 'a', duration: 3 }),
      makeTask({ id: 'b', duration: 2, dependencies: [dep('a')] }),
    ]
    const summary = computePert(tasks, makeCalendar())
    // a: te = (2 + 12 + 5) / 6 -> 3 hari kerja, jadi b mulai hari kerja ke-4.
    expect(summary.schedule.byId.get('a')?.finishDate).toBe(DAY(2))
    expect(summary.schedule.byId.get('b')?.startDate).toBe(DAY(3))
    expect(summary.schedule.byId.get('b')?.finishDate).toBe(DAY(4))
    expect(summary.schedule.criticalPath).toEqual(['a', 'b'])
  })
})

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.6448)).toBeCloseTo(0.95, 3)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
  })

  it('saturates at the tails', () => {
    expect(normalCdf(-40)).toBe(0)
    expect(normalCdf(40)).toBe(1)
  })
})
