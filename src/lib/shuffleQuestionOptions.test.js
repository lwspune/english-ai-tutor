import { describe, it, expect } from 'vitest'
import { shuffleOptions } from './shuffleQuestionOptions'

const Q = () => ({
  options: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  correct_index: 1,
})

function seededRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('shuffleOptions', () => {
  it('preserves the correct answer text at the new correct_index', () => {
    const input = Q()
    const original = input.options[input.correct_index]
    const out = shuffleOptions(input, seededRng(42))
    expect(out.options[out.correct_index]).toBe(original)
  })

  it('returns the same set of option strings (just permuted)', () => {
    const input = Q()
    const out = shuffleOptions(input, seededRng(7))
    expect([...out.options].sort()).toEqual([...input.options].sort())
    expect(out.options).toHaveLength(4)
  })

  it('does not mutate the input', () => {
    const input = Q()
    const snapshot = { options: [...input.options], correct_index: input.correct_index }
    shuffleOptions(input, seededRng(7))
    expect(input.options).toEqual(snapshot.options)
    expect(input.correct_index).toBe(snapshot.correct_index)
  })

  it('produces a roughly uniform distribution of correct_index over many runs', () => {
    const counts = [0, 0, 0, 0]
    const rng = seededRng(123)
    const N = 4000
    for (let i = 0; i < N; i++) {
      const out = shuffleOptions(Q(), rng)
      counts[out.correct_index]++
    }
    const expected = N / 4
    const tolerance = expected * 0.2
    counts.forEach(c => expect(Math.abs(c - expected)).toBeLessThan(tolerance))
  })

  it('handles a 3-option question', () => {
    const input = { options: ['x', 'y', 'z'], correct_index: 2 }
    const out = shuffleOptions(input, seededRng(99))
    expect(out.options[out.correct_index]).toBe('z')
    expect([...out.options].sort()).toEqual(['x', 'y', 'z'])
  })

  it('uses Math.random by default when no rng provided', () => {
    const out = shuffleOptions(Q())
    expect(out.options[out.correct_index]).toBe('Bravo')
    expect(out.options).toHaveLength(4)
  })
})
