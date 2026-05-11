export const DEFAULT_MAX_NEW = 5

export function assembleDeck(progressList, allWords, now, options = {}) {
  const maxNew = options.maxNew ?? DEFAULT_MAX_NEW
  const t = now.getTime()
  const progressByWordId = new Map(progressList.map(p => [p.word_id, p]))

  const due = []
  const seenWordIds = new Set()
  for (const word of allWords) {
    const progress = progressByWordId.get(word.id)
    if (!progress) continue
    seenWordIds.add(word.id)
    if (progress.mastered_at) continue
    if (new Date(progress.next_review_at).getTime() > t) continue
    due.push({ ...word, progress })
  }
  due.sort(
    (a, b) =>
      new Date(a.progress.next_review_at).getTime() -
      new Date(b.progress.next_review_at).getTime(),
  )

  const newWords = allWords
    .filter(w => !progressByWordId.has(w.id))
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, maxNew)
    .map(w => ({ ...w, progress: null }))

  return [...due, ...newWords]
}
