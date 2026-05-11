import { describe, it, expect } from 'vitest'
import { buildRetentionQuiz, retentionCap } from './vocabRetentionQuiz'

const vocab = (id, word, opts = {}) => ({
  id,
  word,
  part_of_speech: opts.pos ?? 'noun',
  definition: `def of ${word}`,
  example_sentence: `${word} in a sentence.`,
  synonyms: opts.synonyms ?? [`${word}-s1`, `${word}-s2`, `${word}-s3`],
  antonyms: opts.antonyms ?? [`${word}-a1`, `${word}-a2`, `${word}-a3`],
})

const ABANDON = vocab('w1', 'Abandon')
const BRISK = vocab('w2', 'Brisk')
const CANDID = vocab('w3', 'Candid')
const POOL = [ABANDON, BRISK, CANDID, vocab('w4', 'Dormant'), vocab('w5', 'Eminent'), vocab('w6', 'Frugal')]
const VOCAB_MAP = new Map(POOL.map(v => [v.word.toLowerCase(), v]))

const wordResult = (word, status = 'correct') => ({ word, status })

describe('retentionCap', () => {
  it('1 question for short passages (<100 words)', () => {
    expect(retentionCap(80)).toBe(1)
    expect(retentionCap(99)).toBe(1)
  })

  it('2 questions for medium passages (100-200)', () => {
    expect(retentionCap(100)).toBe(2)
    expect(retentionCap(199)).toBe(2)
  })

  it('3 questions for long passages (200+)', () => {
    expect(retentionCap(200)).toBe(3)
    expect(retentionCap(500)).toBe(3)
  })
})

describe('buildRetentionQuiz', () => {
  it('returns empty array when no vocab words match the passage', () => {
    const wordResults = [wordResult('Hello'), wordResult('there')]
    expect(buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)).toEqual([])
  })

  it('returns empty when all matching vocab words are mastered', () => {
    const wordResults = [wordResult('Abandon'), wordResult('Brisk')]
    const progress = [
      { word_id: 'w1', mastered_at: '2026-04-01T00:00:00Z' },
      { word_id: 'w2', mastered_at: '2026-04-01T00:00:00Z' },
    ]
    expect(buildRetentionQuiz(wordResults, VOCAB_MAP, progress, POOL)).toEqual([])
  })

  it('returns up to maxQuestions cards based on passage length', () => {
    const wordResults = [
      ...Array(50).fill(0).map(() => wordResult('Hello')),
      wordResult('Abandon'),
      wordResult('Brisk'),
      wordResult('Candid'),
    ]
    // 53 word results → cap is 1
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    expect(cards).toHaveLength(1)
  })

  it('returns 2 cards for medium passage with 2+ vocab matches', () => {
    const wordResults = [
      ...Array(150).fill(0).map(() => wordResult('filler')),
      wordResult('Abandon'),
      wordResult('Brisk'),
      wordResult('Candid'),
    ]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    expect(cards).toHaveLength(2)
  })

  it('returns 3 cards for long passage with 3+ vocab matches', () => {
    const wordResults = [
      ...Array(250).fill(0).map(() => wordResult('filler')),
      wordResult('Abandon'),
      wordResult('Brisk'),
      wordResult('Candid'),
    ]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    expect(cards).toHaveLength(3)
  })

  it('caps at available vocab matches when fewer than the cap', () => {
    const wordResults = [
      ...Array(250).fill(0).map(() => wordResult('filler')),
      wordResult('Abandon'),
    ]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    expect(cards).toHaveLength(1)
  })

  it('dedupes repeated vocab words from word_results', () => {
    const wordResults = [
      ...Array(250).fill(0).map(() => wordResult('filler')),
      wordResult('Abandon'),
      wordResult('Abandon'),
      wordResult('Abandon'),
    ]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    expect(cards).toHaveLength(1)
  })

  it('matches vocab case-insensitively and strips trailing punctuation', () => {
    const wordResults = [wordResult('abandon,'), wordResult('Brisk.')]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.map(c => c.word_id).sort()).toEqual(['w1', 'w2'].slice(0, cards.length).sort())
  })

  it('skips words flagged as omissions in word_results too (still counts as exposure)', () => {
    const wordResults = [
      ...Array(50).fill(0).map(() => wordResult('filler')),
      wordResult('Abandon', 'omission'),
    ]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    // even omitted words count for retention quiz — the word was in the passage
    expect(cards).toHaveLength(1)
  })

  it('every card is a valid MCQ with 4 options and a correctIndex', () => {
    const wordResults = [
      ...Array(50).fill(0).map(() => wordResult('filler')),
      wordResult('Abandon'),
    ]
    const cards = buildRetentionQuiz(wordResults, VOCAB_MAP, [], POOL)
    for (const c of cards) {
      expect(c.options).toHaveLength(4)
      expect(c.correctIndex).toBeGreaterThanOrEqual(0)
      expect(c.correctIndex).toBeLessThan(4)
    }
  })
})
