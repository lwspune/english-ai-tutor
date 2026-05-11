import { describe, it, expect } from 'vitest'
import {
  BOX_INTERVALS_DAYS,
  MAX_BOX,
  MASTERY_CORRECT_THRESHOLD,
  MAINTENANCE_INTERVAL_DAYS,
  nextReview,
  isMastered,
  isDueForMaintenance,
  dueWords,
} from './srs'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-05-11T10:00:00Z')

describe('nextReview', () => {
  it('correct at box 1 → box 2, 3 days out', () => {
    const r = nextReview(1, true, NOW)
    expect(r.nextBox).toBe(2)
    expect(r.nextReviewAt.getTime()).toBe(NOW.getTime() + 3 * DAY_MS)
  })

  it('correct at box 2 → box 3, 7 days out', () => {
    const r = nextReview(2, true, NOW)
    expect(r.nextBox).toBe(3)
    expect(r.nextReviewAt.getTime()).toBe(NOW.getTime() + 7 * DAY_MS)
  })

  it('correct at box 3 → box 4, 14 days out', () => {
    const r = nextReview(3, true, NOW)
    expect(r.nextBox).toBe(4)
    expect(r.nextReviewAt.getTime()).toBe(NOW.getTime() + 14 * DAY_MS)
  })

  it('correct at box 4 → box 5, 30 days out', () => {
    const r = nextReview(4, true, NOW)
    expect(r.nextBox).toBe(5)
    expect(r.nextReviewAt.getTime()).toBe(NOW.getTime() + 30 * DAY_MS)
  })

  it('correct at box 5 stays at box 5, 30 days out (already max)', () => {
    const r = nextReview(5, true, NOW)
    expect(r.nextBox).toBe(5)
    expect(r.nextReviewAt.getTime()).toBe(NOW.getTime() + 30 * DAY_MS)
  })

  it('wrong at any box drops to box 1 with 1-day interval', () => {
    for (const startBox of [1, 2, 3, 4, 5]) {
      const r = nextReview(startBox, false, NOW)
      expect(r.nextBox).toBe(1)
      expect(r.nextReviewAt.getTime()).toBe(NOW.getTime() + 1 * DAY_MS)
    }
  })

  it('uses provided now (not Date.now)', () => {
    const customNow = new Date('2030-01-01T00:00:00Z')
    const r = nextReview(2, true, customNow)
    expect(r.nextReviewAt.getTime()).toBe(customNow.getTime() + 7 * DAY_MS)
  })

  it('throws on invalid box', () => {
    expect(() => nextReview(0, true, NOW)).toThrow()
    expect(() => nextReview(6, true, NOW)).toThrow()
  })
})

describe('isMastered', () => {
  it('box 5 with 3+ correct counts → mastered', () => {
    expect(isMastered({ srs_box: 5, correct_count: 3 })).toBe(true)
    expect(isMastered({ srs_box: 5, correct_count: 5 })).toBe(true)
  })

  it('box 5 with fewer than 3 correct → not mastered yet', () => {
    expect(isMastered({ srs_box: 5, correct_count: 2 })).toBe(false)
    expect(isMastered({ srs_box: 5, correct_count: 0 })).toBe(false)
  })

  it('any box below 5 → not mastered', () => {
    for (const box of [1, 2, 3, 4]) {
      expect(isMastered({ srs_box: box, correct_count: 100 })).toBe(false)
    }
  })

  it('already-mastered row stays mastered', () => {
    expect(isMastered({ srs_box: 5, correct_count: 3, mastered_at: '2026-04-01' })).toBe(true)
  })

  it('preserves constants', () => {
    expect(MAX_BOX).toBe(5)
    expect(MASTERY_CORRECT_THRESHOLD).toBe(3)
    expect(BOX_INTERVALS_DAYS).toEqual([1, 3, 7, 14, 30])
  })
})

describe('isDueForMaintenance', () => {
  it('MAINTENANCE_INTERVAL_DAYS is 30', () => {
    expect(MAINTENANCE_INTERVAL_DAYS).toBe(30)
  })

  it('non-mastered word is never due for maintenance', () => {
    expect(isDueForMaintenance({ mastered_at: null }, NOW)).toBe(false)
    expect(isDueForMaintenance({}, NOW)).toBe(false)
  })

  it('just-mastered word is not yet due for maintenance', () => {
    expect(isDueForMaintenance({ mastered_at: NOW.toISOString() }, NOW)).toBe(false)
  })

  it('mastered 29 days ago: not yet due', () => {
    const masteredAt = new Date(NOW.getTime() - 29 * DAY_MS).toISOString()
    expect(isDueForMaintenance({ mastered_at: masteredAt }, NOW)).toBe(false)
  })

  it('mastered exactly 30 days ago: due', () => {
    const masteredAt = new Date(NOW.getTime() - 30 * DAY_MS).toISOString()
    expect(isDueForMaintenance({ mastered_at: masteredAt }, NOW)).toBe(true)
  })

  it('mastered 60 days ago: due', () => {
    const masteredAt = new Date(NOW.getTime() - 60 * DAY_MS).toISOString()
    expect(isDueForMaintenance({ mastered_at: masteredAt }, NOW)).toBe(true)
  })
})

describe('dueWords', () => {
  const overdue = { word_id: 'a', next_review_at: '2026-05-10T00:00:00Z', mastered_at: null }
  const dueNow = { word_id: 'b', next_review_at: NOW.toISOString(), mastered_at: null }
  const future = { word_id: 'c', next_review_at: '2026-06-01T00:00:00Z', mastered_at: null }
  const mastered = { word_id: 'd', next_review_at: '2026-04-01T00:00:00Z', mastered_at: '2026-04-15T00:00:00Z' }

  it('returns rows where next_review_at <= now and not mastered', () => {
    const out = dueWords([overdue, dueNow, future, mastered], NOW)
    expect(out.map(w => w.word_id).sort()).toEqual(['a', 'b'])
  })

  it('sorts by next_review_at ascending (oldest due first)', () => {
    const out = dueWords([dueNow, overdue], NOW)
    expect(out.map(w => w.word_id)).toEqual(['a', 'b'])
  })

  it('empty input → empty output', () => {
    expect(dueWords([], NOW)).toEqual([])
  })

  it('all mastered → empty output', () => {
    expect(dueWords([mastered], NOW)).toEqual([])
  })

  it('does not mutate input', () => {
    const input = [overdue, dueNow, future]
    const snapshot = input.map(w => w.word_id)
    dueWords(input, NOW)
    expect(input.map(w => w.word_id)).toEqual(snapshot)
  })
})
