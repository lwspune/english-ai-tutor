import { describe, it, expect } from 'vitest'
import {
  isOutlierSession,
  OUTLIER_MIN_ACCURACY,
  OUTLIER_GAP_THRESHOLD,
  OUTLIER_MIN_OTHER_SESSIONS,
} from './anomalyFlag'

const session = (id, accuracy) => ({ id, score_accuracy: accuracy })

describe('isOutlierSession', () => {
  it('exports the calibrated thresholds', () => {
    expect(OUTLIER_MIN_ACCURACY).toBe(95)
    expect(OUTLIER_GAP_THRESHOLD).toBe(20)
    expect(OUTLIER_MIN_OTHER_SESSIONS).toBe(2)
  })

  it('returns not-outlier when there are no other sessions', () => {
    const s = session('a', 100)
    expect(isOutlierSession(s, [s]).outlier).toBe(false)
  })

  it('returns not-outlier when there is only 1 other session', () => {
    const s = session('a', 100)
    const other = session('b', 50)
    expect(isOutlierSession(s, [s, other]).outlier).toBe(false)
  })

  it('flags the Gurusai case (100% accuracy with prior reads of 46 and 81)', () => {
    const flagged = session('env-prot', 100)
    const others = [session('inclusive', 46), session('honesty', 81)]
    const result = isOutlierSession(flagged, [flagged, ...others])
    expect(result.outlier).toBe(true)
    expect(result.reason).toContain('100%')
    expect(result.reason).toContain('64%') // mean of 46+81 = 63.5 → rounds to 64
  })

  it('does not flag when current accuracy is below 95', () => {
    const s = session('a', 94)
    const others = [session('b', 50), session('c', 55)]
    expect(isOutlierSession(s, [s, ...others]).outlier).toBe(false)
  })

  it('does not flag when gap to other-mean is below threshold', () => {
    // current 96, others mean 80, gap 16 < 20 → not flagged
    const s = session('a', 96)
    const others = [session('b', 78), session('c', 82)]
    expect(isOutlierSession(s, [s, ...others]).outlier).toBe(false)
  })

  it('flags when gap equals threshold exactly (boundary at 20)', () => {
    // current 100, others mean 80, gap 20 → flagged (>=)
    const s = session('a', 100)
    const others = [session('b', 80), session('c', 80)]
    expect(isOutlierSession(s, [s, ...others]).outlier).toBe(true)
  })

  it('does not flag a consistently strong student (others mean already high)', () => {
    // others mean 92; even 100 gives gap 8 < 20 → not flagged
    const s = session('a', 100)
    const others = [session('b', 90), session('c', 94), session('d', 92)]
    expect(isOutlierSession(s, [s, ...others]).outlier).toBe(false)
  })

  it('flags a 95% score above a struggling baseline', () => {
    // current 95, others mean 60, gap 35 → flagged
    const s = session('a', 95)
    const others = [session('b', 55), session('c', 65)]
    expect(isOutlierSession(s, [s, ...others]).outlier).toBe(true)
  })

  it('excludes the session itself from the "other" mean computation', () => {
    // 3 sessions: 100, 100, 100. For each one, other-mean = 100. Gap = 0. None flagged.
    const a = session('a', 100)
    const b = session('b', 100)
    const c = session('c', 100)
    const all = [a, b, c]
    expect(isOutlierSession(a, all).outlier).toBe(false)
    expect(isOutlierSession(b, all).outlier).toBe(false)
    expect(isOutlierSession(c, all).outlier).toBe(false)
  })

  it('handles allSessions not containing the target session gracefully', () => {
    // session passed in not present in array — treat array as "others"
    const s = session('a', 100)
    const others = [session('b', 46), session('c', 81)]
    expect(isOutlierSession(s, others).outlier).toBe(true)
  })

  it('returns a reason string with the gap rounded to integer', () => {
    const s = session('a', 100)
    const others = [session('b', 46), session('c', 81)]
    const { reason } = isOutlierSession(s, [s, ...others])
    // gap = 100 - 63.5 = 36.5 → "37pts" (rounded)
    expect(reason).toMatch(/3[67]\s*pts?/)
  })
})
