export function computeAvgComprehension(sessions) {
  const scored = sessions.filter(s => s.score_comprehension != null)
  if (scored.length === 0) return null
  return Math.round(scored.reduce((sum, s) => sum + s.score_comprehension, 0) / scored.length)
}
