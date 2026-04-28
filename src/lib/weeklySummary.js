const IST = 'Asia/Kolkata'
const DAY_MS = 24 * 60 * 60 * 1000

function getDayOfWeek(date) {
  const d = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'short' }).format(date)
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[d]
}

// Returns "YYYY-MM-DD" string of the Monday of the week containing `date` (IST)
export function getWeekKey(date = new Date()) {
  const dow = getDayOfWeek(date)
  const daysToMonday = dow === 0 ? 6 : dow - 1
  return new Date(date.getTime() - daysToMonday * DAY_MS)
    .toLocaleDateString('en-CA', { timeZone: IST })
}

export function shouldShowWeeklySummary(studentId, today = new Date()) {
  const seen = localStorage.getItem(`weekly_summary_seen_${studentId}`)
  return seen !== getWeekKey(today)
}

export function markWeeklySummaryShown(studentId, today = new Date()) {
  localStorage.setItem(`weekly_summary_seen_${studentId}`, getWeekKey(today))
}

function avg(sessions) {
  if (sessions.length === 0) return null
  return Math.round(sessions.reduce((s, r) => s + r.score_accuracy, 0) / sessions.length)
}

function inRange(session, fromMs, toMs) {
  const t = new Date(session.created_at).getTime()
  return t >= fromMs && t < toMs
}

export function computeWeeklySummaryData(sessions, today = new Date()) {
  const currentMondayMs = new Date(getWeekKey(today) + 'T00:00:00+05:30').getTime()
  const lastMondayMs = currentMondayMs - 7 * DAY_MS
  const prevMondayMs = lastMondayMs - 7 * DAY_MS

  const lastWeek = sessions.filter(s => inRange(s, lastMondayMs, currentMondayMs))
  const prevWeek = sessions.filter(s => inRange(s, prevMondayMs, lastMondayMs))

  const passagesLastWeek = new Set(lastWeek.map(s => s.passage_id)).size
  const accuracyLastWeek = avg(lastWeek)
  const accuracyPrevWeek = avg(prevWeek)

  let trend = null
  if (accuracyLastWeek !== null && accuracyPrevWeek !== null) {
    const diff = accuracyLastWeek - accuracyPrevWeek
    trend = diff > 2 ? 'up' : diff < -2 ? 'down' : 'same'
  }

  const monDate = new Date(lastMondayMs)
  const friDate = new Date(lastMondayMs + 4 * DAY_MS)
  const fmt = d => d.toLocaleDateString('en-IN', { timeZone: IST, month: 'short', day: 'numeric' })
  const weekLabel = `${fmt(monDate)} – ${fmt(friDate)}`

  return { passagesLastWeek, accuracyLastWeek, accuracyPrevWeek, trend, weekLabel }
}
