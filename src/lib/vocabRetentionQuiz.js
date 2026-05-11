import { buildPracticeCards } from './vocabPracticeCard'

const normalize = (s) => s.toLowerCase().replace(/^[^a-z-]+|[^a-z-]+$/g, '')

export function retentionCap(passageWordCount) {
  if (passageWordCount < 100) return 1
  if (passageWordCount < 200) return 2
  return 3
}

export function buildRetentionQuiz(wordResults, vocabMap, studentProgress, allVocab) {
  const cap = retentionCap(wordResults.length)
  const progressByWordId = new Map(studentProgress.map(p => [p.word_id, p]))

  const seen = new Set()
  const matched = []
  for (const r of wordResults) {
    const key = normalize(r.word)
    if (!key || seen.has(key)) continue
    const vocab = vocabMap.get(key)
    if (!vocab) continue
    seen.add(key)
    if (progressByWordId.get(vocab.id)?.mastered_at) continue
    matched.push(vocab)
    if (matched.length >= cap) break
  }

  if (matched.length === 0) return []
  return buildPracticeCards(matched, allVocab, { maxCards: cap })
}
