import { describe, it, expect } from 'vitest'
import { buildReminderList } from './reminders'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-05-08T10:00:00Z').getTime()

function makeUser(id, email, createdDaysAgo, lastSignInAt = null) {
  return {
    id,
    email,
    created_at: new Date(NOW - createdDaysAgo * DAY).toISOString(),
    last_sign_in_at: lastSignInAt,
  }
}

function makeProfile(id, remindedDaysAgo = null) {
  return {
    id,
    full_name: `Student ${id}`,
    last_reminder_sent: remindedDaysAgo != null
      ? new Date(NOW - remindedDaysAgo * DAY).toISOString()
      : null,
  }
}

function makeSession(studentId, daysAgo, accuracy = 90) {
  return {
    student_id: studentId,
    created_at: new Date(NOW - daysAgo * DAY).toISOString(),
    score_accuracy: accuracy,
  }
}

describe('buildReminderList', () => {
  it('activates a student with no sessions whose account is old enough', () => {
    const users = [makeUser('u1', 'a@test.com', 3)]
    const profiles = [makeProfile('u1')]
    const result = buildReminderList(users, profiles, [], NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'u1', type: 'activation' })
  })

  it('skips a student whose account is too new (under 2 days)', () => {
    const users = [makeUser('u1', 'a@test.com', 1)]
    const profiles = [makeProfile('u1')]
    const result = buildReminderList(users, profiles, [], NOW)
    expect(result).toHaveLength(0)
  })

  it('skips a student reminded within the last 3 days (cooldown)', () => {
    const users = [makeUser('u1', 'a@test.com', 3)]
    const profiles = [makeProfile('u1', 2)]
    const result = buildReminderList(users, profiles, [], NOW)
    expect(result).toHaveLength(0)
  })

  it('activates a student whose reminder cooldown has expired (4 days ago)', () => {
    const users = [makeUser('u1', 'a@test.com', 5)]
    const profiles = [makeProfile('u1', 4)]
    const result = buildReminderList(users, profiles, [], NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'u1', type: 'activation' })
  })

  it('re-engages a student whose last session was 4 days ago', () => {
    const users = [makeUser('u1', 'a@test.com', 10)]
    const profiles = [makeProfile('u1')]
    const sessions = [makeSession('u1', 4, 88)]
    const result = buildReminderList(users, profiles, sessions, NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'u1', type: 'reengagement', lastAccuracy: 88 })
  })

  it('skips a student whose last session was 2 days ago (too recent)', () => {
    const users = [makeUser('u1', 'a@test.com', 10)]
    const profiles = [makeProfile('u1')]
    const sessions = [makeSession('u1', 2)]
    const result = buildReminderList(users, profiles, sessions, NOW)
    expect(result).toHaveLength(0)
  })

  it('skips a lapsed student who was reminded 2 days ago (cooldown)', () => {
    const users = [makeUser('u1', 'a@test.com', 10)]
    const profiles = [makeProfile('u1', 2)]
    const sessions = [makeSession('u1', 4)]
    const result = buildReminderList(users, profiles, sessions, NOW)
    expect(result).toHaveLength(0)
  })

  it('skips a user with no matching student profile (teacher)', () => {
    const users = [makeUser('t1', 'teacher@test.com', 10)]
    const profiles = [] // no profile means not a student
    const result = buildReminderList(users, profiles, [], NOW)
    expect(result).toHaveLength(0)
  })

  it('skips a user with no email', () => {
    const users = [{ id: 'u1', email: null, created_at: new Date(NOW - 5 * DAY).toISOString() }]
    const profiles = [makeProfile('u1')]
    const result = buildReminderList(users, profiles, [], NOW)
    expect(result).toHaveLength(0)
  })
})
