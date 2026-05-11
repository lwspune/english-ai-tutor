export const DEFAULT_MAX_CARDS = 10

export function buildPracticeCards(deckWords, allWords, options = {}) {
  const maxCards = options.maxCards ?? DEFAULT_MAX_CARDS
  const rng = options.rng ?? Math.random

  const distractorPool = new Set()
  for (const w of allWords ?? []) {
    for (const s of w.synonyms ?? []) distractorPool.add(String(s))
    for (const a of w.antonyms ?? []) distractorPool.add(String(a))
  }

  const cards = []
  for (let i = 0; i < deckWords.length && cards.length < maxCards; i++) {
    const word = deckWords[i]
    const synonyms = word.synonyms ?? []
    const antonyms = word.antonyms ?? []
    if (synonyms.length === 0 && antonyms.length === 0) continue

    const preferAntonym = cards.length % 2 === 1
    const usingAntonym = preferAntonym && antonyms.length > 0
    const exerciseType = usingAntonym ? 'antonym' : 'synonym'
    const correctSet = usingAntonym ? antonyms : synonyms
    if (correctSet.length === 0) continue

    const correctAnswer = String(correctSet[0])

    const forbidden = new Set([
      word.word.toLowerCase(),
      ...synonyms.map(s => String(s).toLowerCase()),
      ...antonyms.map(a => String(a).toLowerCase()),
    ])
    const pool = [...distractorPool].filter(d => !forbidden.has(d.toLowerCase()))

    const distractors = []
    for (let k = 0; k < 3 && pool.length > 0; k++) {
      const idx = Math.floor(rng() * pool.length)
      const chosen = pool.splice(idx, 1)[0]
      distractors.push(chosen)
    }

    const opts = [correctAnswer, ...distractors]
    for (let k = opts.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1))
      ;[opts[k], opts[j]] = [opts[j], opts[k]]
    }

    cards.push({
      word_id: word.id,
      word: word.word,
      part_of_speech: word.part_of_speech,
      definition: word.definition,
      example_sentence: word.example_sentence,
      audio_path: word.audio_path ?? null,
      exerciseType,
      prompt:
        exerciseType === 'synonym'
          ? `Which word is closest in meaning to "${word.word}"?`
          : `Which word means the opposite of "${word.word}"?`,
      options: opts,
      correctIndex: opts.indexOf(correctAnswer),
    })
  }
  return cards
}
