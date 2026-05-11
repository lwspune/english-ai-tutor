import { describe, it, expect } from 'vitest'
import { buildPracticeCards } from './vocabPracticeCard'

const makeWord = (id, word, opts = {}) => ({
  id,
  word,
  part_of_speech: opts.pos ?? 'noun',
  definition: `def of ${word}`,
  example_sentence: `${word} in a sentence.`,
  synonyms: opts.synonyms ?? [`${word}-syn1`, `${word}-syn2`],
  antonyms: opts.antonyms ?? [`${word}-ant1`, `${word}-ant2`],
})

const POOL = [
  makeWord('w1', 'Abandon'),
  makeWord('w2', 'Brisk'),
  makeWord('w3', 'Candid'),
  makeWord('w4', 'Dormant'),
  makeWord('w5', 'Eminent'),
  makeWord('w6', 'Frugal'),
]

describe('buildPracticeCards', () => {
  it('returns empty array for empty deck', () => {
    expect(buildPracticeCards([], POOL)).toEqual([])
  })

  it('returns one card per deck word (up to maxCards)', () => {
    const cards = buildPracticeCards([POOL[0], POOL[1]], POOL)
    expect(cards).toHaveLength(2)
  })

  it('caps at maxCards', () => {
    const cards = buildPracticeCards(POOL, POOL, { maxCards: 3 })
    expect(cards).toHaveLength(3)
  })

  it('each card has 4 options', () => {
    const cards = buildPracticeCards([POOL[0]], POOL)
    expect(cards[0].options).toHaveLength(4)
  })

  it('correctIndex points to a valid synonym/antonym of the target', () => {
    const cards = buildPracticeCards(POOL.slice(0, 4), POOL)
    for (const card of cards) {
      const correctSet = card.exerciseType === 'synonym'
        ? POOL.find(w => w.id === card.word_id).synonyms
        : POOL.find(w => w.id === card.word_id).antonyms
      expect(correctSet.map(s => s.toLowerCase())).toContain(card.options[card.correctIndex].toLowerCase())
    }
  })

  it('alternates exercise type (synonym, antonym, synonym, antonym, ...)', () => {
    const cards = buildPracticeCards(POOL.slice(0, 4), POOL)
    expect(cards[0].exerciseType).toBe('synonym')
    expect(cards[1].exerciseType).toBe('antonym')
    expect(cards[2].exerciseType).toBe('synonym')
    expect(cards[3].exerciseType).toBe('antonym')
  })

  it('falls back to synonym when target has no antonyms', () => {
    const noAntonym = makeWord('w7', 'Altar', { antonyms: [] })
    const cards = buildPracticeCards([POOL[0], noAntonym], POOL)
    // card 0 expected to be synonym (per alternation), card 1 would be antonym
    // but noAntonym has no antonyms → must fall back to synonym
    expect(cards[1].exerciseType).toBe('synonym')
  })

  it('skips card if both synonyms and antonyms are empty', () => {
    const orphan = makeWord('w8', 'Bare', { synonyms: [], antonyms: [] })
    const cards = buildPracticeCards([POOL[0], orphan, POOL[1]], POOL)
    expect(cards.map(c => c.word_id)).toEqual(['w1', 'w2'])
  })

  it('options never include the target word itself', () => {
    const cards = buildPracticeCards(POOL.slice(0, 3), POOL)
    for (const card of cards) {
      expect(card.options.map(o => o.toLowerCase())).not.toContain(card.word.toLowerCase())
    }
  })

  it('options have no duplicates', () => {
    const cards = buildPracticeCards(POOL.slice(0, 3), POOL)
    for (const card of cards) {
      const lc = card.options.map(o => o.toLowerCase())
      expect(new Set(lc).size).toBe(lc.length)
    }
  })

  it('prompt includes the target word', () => {
    const cards = buildPracticeCards([POOL[0]], POOL)
    expect(cards[0].prompt).toContain('Abandon')
  })

  it('does not mutate input arrays', () => {
    const deck = POOL.slice(0, 2)
    const before = JSON.stringify(POOL)
    buildPracticeCards(deck, POOL)
    expect(JSON.stringify(POOL)).toBe(before)
  })

  it('returns deck-word metadata (definition, example) on the card', () => {
    const cards = buildPracticeCards([POOL[0]], POOL)
    expect(cards[0].definition).toBe('def of Abandon')
    expect(cards[0].example_sentence).toBe('Abandon in a sentence.')
    expect(cards[0].part_of_speech).toBe('noun')
  })
})
