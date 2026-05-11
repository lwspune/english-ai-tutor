import { describe, it, expect } from 'vitest'
import { assembleDeck, DEFAULT_MAX_NEW } from './vocabDeck'

const NOW = new Date('2026-05-11T10:00:00Z')

const w = (id, created = '2026-04-01T00:00:00Z') => ({
  id,
  word: `Word_${id}`,
  definition: 'def',
  created_at: created,
})

const p = (word_id, opts = {}) => ({
  word_id,
  srs_box: opts.box ?? 1,
  next_review_at: opts.due ?? '2026-05-01T00:00:00Z',
  correct_count: opts.correct ?? 0,
  total_encounters: opts.total ?? 0,
  mastered_at: opts.mastered ?? null,
})

describe('assembleDeck', () => {
  it('returns empty when nothing is due and no new available', () => {
    const words = [w('a'), w('b')]
    const progress = [
      p('a', { due: '2026-06-01T00:00:00Z' }),
      p('b', { due: '2026-06-01T00:00:00Z' }),
    ]
    expect(assembleDeck(progress, words, NOW)).toEqual([])
  })

  it('returns due words ordered by next_review_at ascending', () => {
    const words = [w('a'), w('b'), w('c')]
    const progress = [
      p('a', { due: '2026-05-10T00:00:00Z' }),
      p('b', { due: '2026-05-08T00:00:00Z' }),
      p('c', { due: '2026-05-09T00:00:00Z' }),
    ]
    const deck = assembleDeck(progress, words, NOW)
    expect(deck.map(d => d.id)).toEqual(['b', 'c', 'a'])
  })

  it('excludes mastered words from the deck', () => {
    const words = [w('a'), w('b')]
    const progress = [
      p('a', { due: '2026-05-01T00:00:00Z', mastered: '2026-04-15T00:00:00Z' }),
      p('b', { due: '2026-05-01T00:00:00Z' }),
    ]
    const deck = assembleDeck(progress, words, NOW)
    expect(deck.map(d => d.id)).toEqual(['b'])
  })

  it('fills with new words after due, capped at maxNew', () => {
    const words = [
      w('new1', '2026-04-01T00:00:00Z'),
      w('new2', '2026-04-02T00:00:00Z'),
      w('new3', '2026-04-03T00:00:00Z'),
      w('seen', '2026-04-04T00:00:00Z'),
    ]
    const progress = [p('seen', { due: '2026-05-01T00:00:00Z' })]
    const deck = assembleDeck(progress, words, NOW, { maxNew: 2 })
    // due first, then 2 new sorted by created_at asc
    expect(deck.map(d => d.id)).toEqual(['seen', 'new1', 'new2'])
  })

  it('returns only new words when no due', () => {
    const words = [w('n1', '2026-04-01T00:00:00Z'), w('n2', '2026-04-02T00:00:00Z')]
    const deck = assembleDeck([], words, NOW, { maxNew: 5 })
    expect(deck.map(d => d.id)).toEqual(['n1', 'n2'])
  })

  it('attaches progress info to cards when present', () => {
    const words = [w('a')]
    const progress = [p('a', { due: '2026-05-01T00:00:00Z', box: 3, correct: 2 })]
    const deck = assembleDeck(progress, words, NOW)
    expect(deck[0].progress).toMatchObject({ srs_box: 3, correct_count: 2 })
  })

  it('cards without progress have progress = null', () => {
    const words = [w('new')]
    const deck = assembleDeck([], words, NOW)
    expect(deck[0].progress).toBeNull()
  })

  it('does not mutate inputs', () => {
    const words = [w('a'), w('b')]
    const progress = [p('a', { due: '2026-05-01T00:00:00Z' })]
    const wordsBefore = JSON.stringify(words)
    const progressBefore = JSON.stringify(progress)
    assembleDeck(progress, words, NOW)
    expect(JSON.stringify(words)).toBe(wordsBefore)
    expect(JSON.stringify(progress)).toBe(progressBefore)
  })

  it('respects DEFAULT_MAX_NEW (5)', () => {
    expect(DEFAULT_MAX_NEW).toBe(5)
    const words = Array.from({ length: 10 }, (_, i) =>
      w(`n${i}`, `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    )
    const deck = assembleDeck([], words, NOW)
    expect(deck).toHaveLength(5)
  })

  it('orphan progress (no matching word) is silently dropped', () => {
    const words = [w('a')]
    const progress = [
      p('a', { due: '2026-05-01T00:00:00Z' }),
      p('phantom', { due: '2026-05-01T00:00:00Z' }),
    ]
    const deck = assembleDeck(progress, words, NOW)
    expect(deck.map(d => d.id)).toEqual(['a'])
  })

  it('includes mastered words past the maintenance interval (30 days)', () => {
    const words = [w('a'), w('b')]
    const dayMs = 86_400_000
    const masteredOld = new Date(NOW.getTime() - 31 * dayMs).toISOString()
    const masteredRecent = new Date(NOW.getTime() - 5 * dayMs).toISOString()
    const progress = [
      p('a', { due: '2026-05-01T00:00:00Z', mastered: masteredOld }),
      p('b', { due: '2026-05-01T00:00:00Z', mastered: masteredRecent }),
    ]
    const deck = assembleDeck(progress, words, NOW)
    expect(deck.map(d => d.id)).toEqual(['a'])
  })

  it('mastered word at exactly 30 days is due for maintenance', () => {
    const words = [w('a')]
    const dayMs = 86_400_000
    const masteredAt = new Date(NOW.getTime() - 30 * dayMs).toISOString()
    const progress = [p('a', { due: masteredAt, mastered: masteredAt })]
    const deck = assembleDeck(progress, words, NOW)
    expect(deck.map(d => d.id)).toEqual(['a'])
  })
})
