const MAX_SENTENCE_WORDS = 25

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length
}

function trimAroundWord(sentence, wordRe) {
  const words = sentence.split(/\s+/).filter(Boolean)
  const idx = words.findIndex((w) => wordRe.test(w))
  if (idx === -1) return sentence
  const half = Math.floor(MAX_SENTENCE_WORDS / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(words.length, start + MAX_SENTENCE_WORDS)
  return words.slice(start, end).join(' ')
}

export function findSentence(passageText, word) {
  if (!passageText || !word) return null
  const target = String(word).replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase()
  if (!target) return null

  const sentences = String(passageText)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const wordRe = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i')
  const matches = sentences.filter((s) => wordRe.test(s))
  if (matches.length === 0) return null

  matches.sort((a, b) => wordCount(a) - wordCount(b))
  let chosen = matches[0]
  if (wordCount(chosen) > MAX_SENTENCE_WORDS) {
    chosen = trimAroundWord(chosen, wordRe)
  }

  return { sentence: chosen }
}
