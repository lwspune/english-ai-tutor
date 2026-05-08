const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000
const MIN_ACCOUNT_AGE_MS   = 2 * 24 * 60 * 60 * 1000

/**
 * Pure function — no Supabase dependencies.
 * Determines which students need an activation or re-engagement email.
 *
 * @param {Array} users      - auth.users rows: { id, email, created_at }
 * @param {Array} profiles   - profiles rows (students only): { id, full_name, last_reminder_sent }
 * @param {Array} sessions   - sessions rows: { student_id, created_at, score_accuracy }
 * @param {number} now       - current timestamp (ms), injectable for testing
 * @returns {Array}          - { id, name, email, type: 'activation'|'reengagement', lastAccuracy? }
 */
export function buildReminderList(users, profiles, sessions, now) {
  const profileMap = new Map(profiles.map(p => [p.id, p]))

  const latestSession = new Map()
  for (const s of sessions) {
    if (!latestSession.has(s.student_id)) latestSession.set(s.student_id, s)
  }

  const toRemind = []

  for (const user of users) {
    const profile = profileMap.get(user.id)
    if (!profile || !user.email) continue

    const lastReminder = profile.last_reminder_sent
      ? new Date(profile.last_reminder_sent).getTime()
      : 0
    if (now - lastReminder < REMINDER_INTERVAL_MS) continue

    const session = latestSession.get(user.id)
    const accountAge = now - new Date(user.created_at).getTime()

    if (!session) {
      if (accountAge >= MIN_ACCOUNT_AGE_MS) {
        toRemind.push({ id: user.id, name: profile.full_name, email: user.email, type: 'activation' })
      }
    } else {
      const lastSessionAge = now - new Date(session.created_at).getTime()
      if (lastSessionAge >= REMINDER_INTERVAL_MS) {
        toRemind.push({
          id: user.id, name: profile.full_name, email: user.email,
          type: 'reengagement', lastAccuracy: session.score_accuracy,
        })
      }
    }
  }

  return toRemind
}
