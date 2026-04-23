import { describe, it, expect } from 'vitest'
import { computeAvgComprehension } from './studentStats'

describe('computeAvgComprehension', () => {
  it('returns null when no sessions have comprehension scores', () => {
    const sessions = [
      { score_comprehension: null },
      { score_comprehension: null },
    ]
    expect(computeAvgComprehension(sessions)).toBeNull()
  })

  it('returns null for empty session list', () => {
    expect(computeAvgComprehension([])).toBeNull()
  })

  it('averages only sessions that have a score', () => {
    const sessions = [
      { score_comprehension: 100 },
      { score_comprehension: null },
      { score_comprehension: 60 },
    ]
    expect(computeAvgComprehension(sessions)).toBe(80)
  })

  it('rounds to nearest integer', () => {
    const sessions = [
      { score_comprehension: 100 },
      { score_comprehension: 67 },
    ]
    expect(computeAvgComprehension(sessions)).toBe(84)
  })

  it('returns exact score when only one session answered', () => {
    const sessions = [
      { score_comprehension: null },
      { score_comprehension: 75 },
    ]
    expect(computeAvgComprehension(sessions)).toBe(75)
  })
})
