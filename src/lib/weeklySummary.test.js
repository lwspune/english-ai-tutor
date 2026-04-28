import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getWeekKey,
  shouldShowWeeklySummary,
  markWeeklySummaryShown,
  computeWeeklySummaryData,
} from './weeklySummary'

// All dates expressed in IST (UTC+5:30)
// Week of April 27–May 3, 2026 (Mon–Sun)
const MON_APR_27 = new Date('2026-04-27T06:00:00+05:30')
const TUE_APR_28 = new Date('2026-04-28T09:00:00+05:30')
const SUN_APR_26 = new Date('2026-04-26T10:00:00+05:30') // previous week
const FRI_APR_24 = new Date('2026-04-24T15:00:00+05:30') // two weeks ago Mon starts Apr 20

describe('getWeekKey', () => {
  it('returns the Monday date string for a Monday', () => {
    expect(getWeekKey(MON_APR_27)).toBe('2026-04-27')
  })

  it('returns the Monday of the same week for a mid-week day', () => {
    expect(getWeekKey(TUE_APR_28)).toBe('2026-04-27')
  })

  it('returns the previous Monday for a Sunday', () => {
    expect(getWeekKey(SUN_APR_26)).toBe('2026-04-20')
  })

  it('returns the Monday of the week for a Friday', () => {
    expect(getWeekKey(FRI_APR_24)).toBe('2026-04-20')
  })
})

describe('shouldShowWeeklySummary / markWeeklySummaryShown', () => {
  const STUDENT_ID = 'student-abc'

  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('returns true when no entry exists in localStorage', () => {
    expect(shouldShowWeeklySummary(STUDENT_ID, TUE_APR_28)).toBe(true)
  })

  it('returns false after markWeeklySummaryShown is called for the same week', () => {
    markWeeklySummaryShown(STUDENT_ID, TUE_APR_28)
    expect(shouldShowWeeklySummary(STUDENT_ID, TUE_APR_28)).toBe(false)
  })

  it('returns true again after a new week starts', () => {
    markWeeklySummaryShown(STUDENT_ID, TUE_APR_28)
    const NEXT_WEEK_MON = new Date('2026-05-04T09:00:00+05:30')
    expect(shouldShowWeeklySummary(STUDENT_ID, NEXT_WEEK_MON)).toBe(true)
  })

  it('is isolated per student id', () => {
    markWeeklySummaryShown(STUDENT_ID, TUE_APR_28)
    expect(shouldShowWeeklySummary('other-student', TUE_APR_28)).toBe(true)
  })
})

describe('computeWeeklySummaryData', () => {
  // today = Tuesday April 28 IST
  // last week = Mon Apr 20 – Sun Apr 26 IST
  // week before = Mon Apr 13 – Sun Apr 19 IST
  const today = TUE_APR_28

  function makeSession(isoDate, passageId, accuracy) {
    return { created_at: isoDate, passage_id: passageId, score_accuracy: accuracy }
  }

  it('counts unique passages read last week', () => {
    const sessions = [
      makeSession('2026-04-21T10:00:00+05:30', 'p1', 80),
      makeSession('2026-04-22T10:00:00+05:30', 'p1', 85), // same passage, 2 attempts
      makeSession('2026-04-23T10:00:00+05:30', 'p2', 70),
    ]
    const { passagesLastWeek } = computeWeeklySummaryData(sessions, today)
    expect(passagesLastWeek).toBe(2)
  })

  it('returns 0 passages when no sessions last week', () => {
    const sessions = [makeSession('2026-04-14T10:00:00+05:30', 'p1', 80)]
    const { passagesLastWeek } = computeWeeklySummaryData(sessions, today)
    expect(passagesLastWeek).toBe(0)
  })

  it('computes average accuracy for last week', () => {
    const sessions = [
      makeSession('2026-04-21T10:00:00+05:30', 'p1', 80),
      makeSession('2026-04-22T10:00:00+05:30', 'p2', 90),
    ]
    const { accuracyLastWeek } = computeWeeklySummaryData(sessions, today)
    expect(accuracyLastWeek).toBe(85)
  })

  it('returns null accuracy when no sessions last week', () => {
    const { accuracyLastWeek } = computeWeeklySummaryData([], today)
    expect(accuracyLastWeek).toBeNull()
  })

  it('trend is up when last week accuracy is meaningfully higher', () => {
    const sessions = [
      makeSession('2026-04-21T10:00:00+05:30', 'p1', 88), // last week
      makeSession('2026-04-14T10:00:00+05:30', 'p2', 70), // week before
    ]
    const { trend } = computeWeeklySummaryData(sessions, today)
    expect(trend).toBe('up')
  })

  it('trend is down when last week accuracy is meaningfully lower', () => {
    const sessions = [
      makeSession('2026-04-21T10:00:00+05:30', 'p1', 60),
      makeSession('2026-04-14T10:00:00+05:30', 'p2', 80),
    ]
    const { trend } = computeWeeklySummaryData(sessions, today)
    expect(trend).toBe('down')
  })

  it('trend is same when accuracy difference is within 2 points', () => {
    const sessions = [
      makeSession('2026-04-21T10:00:00+05:30', 'p1', 81),
      makeSession('2026-04-14T10:00:00+05:30', 'p2', 80),
    ]
    const { trend } = computeWeeklySummaryData(sessions, today)
    expect(trend).toBe('same')
  })

  it('trend is null when only one week has data', () => {
    const sessions = [makeSession('2026-04-21T10:00:00+05:30', 'p1', 80)]
    const { trend } = computeWeeklySummaryData(sessions, today)
    expect(trend).toBeNull()
  })

  it('weekLabel shows Mon–Fri date range of last week', () => {
    const { weekLabel } = computeWeeklySummaryData([], today)
    // Last week Mon = Apr 20, Fri = Apr 24 (en-IN format: "20 Apr")
    expect(weekLabel).toContain('20 Apr')
    expect(weekLabel).toContain('24 Apr')
  })
})
