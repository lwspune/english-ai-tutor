const RANK = { easy: 0, moderate: 1, hard: 2 }

export function sortByDifficulty(passages) {
  return [...passages].sort((a, b) => {
    const ra = RANK[a.difficulty] ?? 0
    const rb = RANK[b.difficulty] ?? 0
    if (ra !== rb) return ra - rb
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta - tb
  })
}
