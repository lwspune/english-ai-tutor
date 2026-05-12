import { describe, it, expect } from 'vitest'
import { scoreDrillAttempt } from './drillScoring'

describe('scoreDrillAttempt', () => {
  it('marks correct when stumble word appears in transcript', () => {
    expect(
      scoreDrillAttempt({ transcript: 'AI systems detect fraudulent transactions', stumbleWord: 'fraudulent' }),
    ).toEqual({ score: 100, wasCorrect: true })
  })

  it('marks wrong when stumble word is missing from transcript', () => {
    expect(
      scoreDrillAttempt({ transcript: 'AI systems detect transactions', stumbleWord: 'fraudulent' }),
    ).toEqual({ score: 0, wasCorrect: false })
  })

  it('matches case-insensitively', () => {
    expect(
      scoreDrillAttempt({ transcript: 'AI Systems Detect FRAUDULENT Transactions', stumbleWord: 'fraudulent' }),
    ).toEqual({ score: 100, wasCorrect: true })
  })

  it('tolerates surrounding punctuation in the transcript', () => {
    expect(
      scoreDrillAttempt({ transcript: 'detect fraudulent, transactions.', stumbleWord: 'fraudulent' }),
    ).toEqual({ score: 100, wasCorrect: true })
  })

  it('strips trailing punctuation from the stumble word before matching', () => {
    expect(
      scoreDrillAttempt({ transcript: 'detect fraudulent transactions', stumbleWord: 'fraudulent,' }),
    ).toEqual({ score: 100, wasCorrect: true })
  })

  it('does not match partial words ("fund" should not match "fraudulent")', () => {
    expect(
      scoreDrillAttempt({ transcript: 'detect fraudulent transactions', stumbleWord: 'fund' }),
    ).toEqual({ score: 0, wasCorrect: false })
  })

  it('returns wrong for empty transcript', () => {
    expect(scoreDrillAttempt({ transcript: '', stumbleWord: 'fraudulent' })).toEqual({
      score: 0,
      wasCorrect: false,
    })
  })

  it('returns wrong for null/undefined transcript', () => {
    expect(scoreDrillAttempt({ transcript: null, stumbleWord: 'fraudulent' })).toEqual({
      score: 0,
      wasCorrect: false,
    })
  })

  it('returns wrong for empty stumble word', () => {
    expect(scoreDrillAttempt({ transcript: 'anything', stumbleWord: '' })).toEqual({
      score: 0,
      wasCorrect: false,
    })
  })
})
