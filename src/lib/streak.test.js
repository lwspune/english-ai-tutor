import { describe, it, expect } from 'vitest'
import { computeStreak } from './streak'

// Sessions are created at noon IST (06:30 UTC) to avoid timezone edge cases
const s = (isoDate) => ({ created_at: `${isoDate}T06:30:00.000Z` })

// Known days (2026-04-20 is a Monday in IST)
const MON = new Date('2026-04-20T06:30:00.000Z')
const TUE = new Date('2026-04-21T06:30:00.000Z')
const WED = new Date('2026-04-22T06:30:00.000Z')
const THU = new Date('2026-04-23T06:30:00.000Z')
const FRI = new Date('2026-04-24T06:30:00.000Z')
const SAT = new Date('2026-04-25T06:30:00.000Z')
const SUN = new Date('2026-04-26T06:30:00.000Z')
const NEXT_MON = new Date('2026-04-27T06:30:00.000Z')

describe('computeStreak', () => {
  it('returns 0 with no sessions', () => {
    expect(computeStreak([], MON)).toBe(0)
  })

  it('returns 1 when only today has a session', () => {
    expect(computeStreak([s('2026-04-20')], MON)).toBe(1)
  })

  it('returns 2 for two consecutive school days ending today', () => {
    expect(computeStreak([s('2026-04-20'), s('2026-04-21')], TUE)).toBe(2)
  })

  it('returns 0 when most recent session was two school days ago', () => {
    expect(computeStreak([s('2026-04-20')], WED)).toBe(0)
  })

  it('shows active streak when student read yesterday but not yet today', () => {
    // Mon session, checked on Tue before reading — streak is still 1 (alive until Tue ends)
    expect(computeStreak([s('2026-04-20')], TUE)).toBe(1)
  })

  it('counts session on Friday as active streak when today is Saturday', () => {
    expect(computeStreak([s('2026-04-24')], SAT)).toBe(1)
  })

  it('counts session on Friday as active streak when today is Sunday', () => {
    expect(computeStreak([s('2026-04-24')], SUN)).toBe(1)
  })

  it('counts session on Friday as active streak when today is the following Monday', () => {
    expect(computeStreak([s('2026-04-24')], NEXT_MON)).toBe(1)
  })

  it('extends streak across a weekend (Thu+Fri, checked on Monday)', () => {
    expect(computeStreak([s('2026-04-23'), s('2026-04-24')], NEXT_MON)).toBe(2)
  })

  it('breaks streak when Friday was missed (only Thu, checked on Monday)', () => {
    expect(computeStreak([s('2026-04-23')], NEXT_MON)).toBe(0)
  })

  it('counts a full Mon–Fri week as streak 5', () => {
    const sessions = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24'].map(s)
    expect(computeStreak(sessions, FRI)).toBe(5)
  })

  it('multiple sessions on the same day count as one streak day', () => {
    expect(computeStreak([s('2026-04-20'), s('2026-04-20')], MON)).toBe(1)
  })

  it('ignores weekend sessions when computing streak', () => {
    // Only Saturday session — no school day session, streak = 0
    expect(computeStreak([s('2026-04-25')], SAT)).toBe(0)
  })

  it('does not count a weekend session toward the streak length', () => {
    // Fri + Sat sessions, checked on Mon → streak is 1 (Fri only, Sat ignored)
    expect(computeStreak([s('2026-04-24'), s('2026-04-25')], NEXT_MON)).toBe(1)
  })
})
