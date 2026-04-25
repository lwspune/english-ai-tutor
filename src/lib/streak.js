const IST = 'Asia/Kolkata'

function toLocalDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: IST })
}

function dayOfWeek(date) {
  const d = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'short' }).format(date)
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[d]
}

function isSchoolDay(date) {
  const day = dayOfWeek(date)
  return day >= 1 && day <= 5
}

function prevSchoolDay(date) {
  const d = new Date(date)
  do {
    d.setDate(d.getDate() - 1)
  } while (!isSchoolDay(d))
  return d
}

export function computeStreak(sessions, today = new Date()) {
  const schoolDaysWithSessions = new Set(
    sessions
      .filter(s => isSchoolDay(new Date(s.created_at)))
      .map(s => toLocalDateStr(new Date(s.created_at)))
  )

  if (schoolDaysWithSessions.size === 0) return 0

  const todayStr = toLocalDateStr(today)
  const startStr = isSchoolDay(today) && schoolDaysWithSessions.has(todayStr)
    ? todayStr
    : toLocalDateStr(prevSchoolDay(today))

  let streak = 0
  let current = new Date(startStr + 'T12:00:00')
  while (schoolDaysWithSessions.has(toLocalDateStr(current))) {
    streak++
    current = prevSchoolDay(current)
  }

  return streak
}
