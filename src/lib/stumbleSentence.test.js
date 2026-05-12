import { describe, it, expect } from 'vitest'
import { findSentence } from './stumbleSentence'

const PASSAGE = [
  'Discipline is the foundation of success in every field of life.',
  'It helps students manage their time, focus on their goals, and avoid distractions.',
  'A disciplined student follows a routine, completes assignments on time, and prepares regularly for exams.',
  'It is not about strict rules but about self-control and responsibility.',
].join(' ')

describe('findSentence', () => {
  it('returns null when word is not in passage', () => {
    expect(findSentence(PASSAGE, 'fraudulent')).toBeNull()
  })

  it('returns null when passage is empty', () => {
    expect(findSentence('', 'fraudulent')).toBeNull()
  })

  it('returns the sentence containing the word', () => {
    const out = findSentence(PASSAGE, 'distractions')
    expect(out.sentence).toBe(
      'It helps students manage their time, focus on their goals, and avoid distractions.',
    )
  })

  it('matches case-insensitively', () => {
    const out = findSentence(PASSAGE, 'DISCIPLINE')
    // first sentence is the shortest containing "Discipline"
    expect(out.sentence.toLowerCase()).toContain('discipline')
  })

  it('strips trailing punctuation from the search word', () => {
    const out = findSentence(PASSAGE, 'distractions,')
    expect(out.sentence).toContain('distractions')
  })

  it('matches whole words only — "fund" should not match "foundation"', () => {
    expect(findSentence(PASSAGE, 'fund')).toBeNull()
  })

  it('returns the shortest matching sentence when the word appears in multiple', () => {
    const text = [
      'The long sentence containing apple goes on and on and on and on and on.',
      'Eats apple daily.',
    ].join(' ')
    const out = findSentence(text, 'apple')
    expect(out.sentence).toBe('Eats apple daily.')
  })

  it('trims a long sentence (>25 words) to a window around the word', () => {
    const long = [...Array(40)].map((_, i) => (i === 20 ? 'fraudulent' : `w${i}`)).join(' ') + '.'
    const out = findSentence(long, 'fraudulent')
    // Trimmed window stays well under 25 words
    expect(out.sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
    // Window still contains the target word
    expect(out.sentence).toContain('fraudulent')
  })

  it('handles passages without terminal period on final sentence', () => {
    const text = 'Discipline matters. Students need it'
    const out = findSentence(text, 'Students')
    expect(out.sentence).toContain('Students')
  })

  it('handles em-dash separated clauses without splitting them', () => {
    const text = 'Critical literacy about how these systems function — and who controls them — has become essential.'
    const out = findSentence(text, 'controls')
    expect(out.sentence).toContain('controls')
  })
})
