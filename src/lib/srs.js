export const BOX_INTERVALS_DAYS = [1, 3, 7, 14, 30]
export const MAX_BOX = 5
export const MASTERY_CORRECT_THRESHOLD = 3

const DAY_MS = 24 * 60 * 60 * 1000

export function nextReview(currentBox, wasCorrect, now) {
  if (!Number.isInteger(currentBox) || currentBox < 1 || currentBox > MAX_BOX) {
    throw new Error(`Invalid SRS box: ${currentBox}`)
  }
  const nextBox = wasCorrect ? Math.min(currentBox + 1, MAX_BOX) : 1
  const intervalDays = wasCorrect ? BOX_INTERVALS_DAYS[nextBox - 1] : BOX_INTERVALS_DAYS[0]
  return {
    nextBox,
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY_MS),
  }
}

export function isMastered({ srs_box, correct_count, mastered_at }) {
  if (mastered_at) return true
  return srs_box >= MAX_BOX && correct_count >= MASTERY_CORRECT_THRESHOLD
}

export function dueWords(progressList, now) {
  const t = now.getTime()
  return progressList
    .filter(p => !p.mastered_at && new Date(p.next_review_at).getTime() <= t)
    .slice()
    .sort((a, b) => new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime())
}
