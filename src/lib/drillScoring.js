function normalize(word) {
  return String(word ?? '').replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase()
}

export function scoreDrillAttempt({ transcript, stumbleWord }) {
  const target = normalize(stumbleWord)
  if (!target) return { score: 0, wasCorrect: false }
  const tokens = String(transcript ?? '').split(/\s+/).filter(Boolean)
  const said = tokens.some((t) => normalize(t) === target)
  return said ? { score: 100, wasCorrect: true } : { score: 0, wasCorrect: false }
}
