export const OUTLIER_MIN_ACCURACY = 95
export const OUTLIER_GAP_THRESHOLD = 20
export const OUTLIER_MIN_OTHER_SESSIONS = 2

export function isOutlierSession(session, allSessionsForStudent) {
  const others = allSessionsForStudent.filter(s => s.id !== session.id)
  if (others.length < OUTLIER_MIN_OTHER_SESSIONS) {
    return { outlier: false, reason: '' }
  }
  if (session.score_accuracy < OUTLIER_MIN_ACCURACY) {
    return { outlier: false, reason: '' }
  }
  const otherMean = others.reduce((sum, s) => sum + s.score_accuracy, 0) / others.length
  const gap = session.score_accuracy - otherMean
  if (gap < OUTLIER_GAP_THRESHOLD) {
    return { outlier: false, reason: '' }
  }
  const gapRounded = Math.round(gap)
  const meanRounded = Math.round(otherMean)
  return {
    outlier: true,
    reason: `Accuracy ${session.score_accuracy}% is ${gapRounded}pts above this student's other sessions (avg ${meanRounded}%). Review the recording.`,
  }
}
