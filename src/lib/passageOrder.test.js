import { describe, it, expect } from 'vitest'
import { sortByDifficulty } from './passageOrder'

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString()

describe('sortByDifficulty', () => {
  it('orders passages easy → moderate → hard', () => {
    const input = [
      { id: 'h', difficulty: 'hard',     created_at: iso(2026, 1, 1) },
      { id: 'e', difficulty: 'easy',     created_at: iso(2026, 1, 1) },
      { id: 'm', difficulty: 'moderate', created_at: iso(2026, 1, 1) },
    ]
    expect(sortByDifficulty(input).map(p => p.id)).toEqual(['e', 'm', 'h'])
  })

  it('breaks ties within the same difficulty by created_at ascending (oldest first)', () => {
    const input = [
      { id: 'e2', difficulty: 'easy', created_at: iso(2026, 3, 10) },
      { id: 'e1', difficulty: 'easy', created_at: iso(2026, 1, 5)  },
      { id: 'e3', difficulty: 'easy', created_at: iso(2026, 5, 20) },
    ]
    expect(sortByDifficulty(input).map(p => p.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('treats null/undefined difficulty as easy', () => {
    const input = [
      { id: 'm',    difficulty: 'moderate', created_at: iso(2026, 1, 1) },
      { id: 'null', difficulty: null,       created_at: iso(2026, 1, 2) },
      { id: 'undf',                         created_at: iso(2026, 1, 3) },
    ]
    const ids = sortByDifficulty(input).map(p => p.id)
    expect(ids.indexOf('null')).toBeLessThan(ids.indexOf('m'))
    expect(ids.indexOf('undf')).toBeLessThan(ids.indexOf('m'))
  })

  it('mixes grade-specific and all-grades passages within the same difficulty bucket', () => {
    const input = [
      { id: 'all-easy',   grade_level: null, difficulty: 'easy', created_at: iso(2026, 2, 1) },
      { id: 'g10-hard',   grade_level: 10,   difficulty: 'hard', created_at: iso(2026, 1, 1) },
      { id: 'g10-easy',   grade_level: 10,   difficulty: 'easy', created_at: iso(2026, 1, 15) },
      { id: 'all-mod',    grade_level: null, difficulty: 'moderate', created_at: iso(2026, 1, 20) },
    ]
    expect(sortByDifficulty(input).map(p => p.id)).toEqual([
      'g10-easy',  // easy, 2026-01-15
      'all-easy',  // easy, 2026-02-01
      'all-mod',   // moderate
      'g10-hard',  // hard
    ])
  })

  it('does not mutate the input array', () => {
    const input = [
      { id: 'h', difficulty: 'hard', created_at: iso(2026, 1, 1) },
      { id: 'e', difficulty: 'easy', created_at: iso(2026, 1, 1) },
    ]
    const snapshot = input.map(p => p.id)
    sortByDifficulty(input)
    expect(input.map(p => p.id)).toEqual(snapshot)
  })
})
