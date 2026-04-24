export const MASTERY_THRESHOLD = 80
const MAX_ATTEMPTS = 3

export function classifyPassages(passages, sessions) {
  const byPassage = Map.groupBy(sessions, s => s.passage_id)

  const todo = []
  const retry = []

  for (const passage of passages) {
    const attempts = byPassage.get(passage.id) ?? []
    if (attempts.length === 0) {
      todo.push(passage)
      continue
    }
    const bestScore = Math.max(...attempts.map(a => a.score_accuracy))
    if (bestScore >= MASTERY_THRESHOLD) continue
    if (attempts.length >= MAX_ATTEMPTS) continue
    retry.push({ ...passage, bestScore, attemptsUsed: attempts.length })
  }

  return { todo, retry }
}
