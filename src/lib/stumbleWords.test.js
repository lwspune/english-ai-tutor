import { describe, it, expect } from 'vitest'
import { selectStumbleWords } from './stumbleWords'

const session = (id, words) => ({
  id,
  word_results: words.map(([word, status]) => ({
    word,
    spoken: status === 'correct' ? word : '',
    status,
  })),
})

describe('selectStumbleWords', () => {
  it('returns [] when no sessions provided', () => {
    expect(selectStumbleWords([])).toEqual([])
  })

  it('returns [] when latest session has no stumbles', () => {
    const s = session('s1', [
      ['hello', 'correct'],
      ['world', 'correct'],
    ])
    expect(selectStumbleWords([s])).toEqual([])
  })

  it('returns top stumbles from a single session', () => {
    const s = session('s1', [
      ['fraudulent', 'substitution'],
      ['discriminate', 'omission'],
      ['amplify', 'substitution'],
      ['the', 'correct'],
    ])
    const out = selectStumbleWords([s])
    expect(out.map((x) => x.word).sort()).toEqual([
      'amplify',
      'discriminate',
      'fraudulent',
    ])
    expect(out).toHaveLength(3)
  })

  it('caps result count at opts.count (default 3)', () => {
    const s = session('s1', [
      ['alpha', 'substitution'],
      ['bravo', 'substitution'],
      ['charlie', 'substitution'],
      ['delta', 'substitution'],
      ['echo', 'omission'],
    ])
    expect(selectStumbleWords([s])).toHaveLength(3)
    expect(selectStumbleWords([s], { count: 5 })).toHaveLength(5)
  })

  it('ranks recurring stumbles above latest-only stumbles', () => {
    const older = session('s_old', [['recurring', 'substitution']])
    const latest = session('s_new', [
      ['recurring', 'substitution'],
      ['oneoff', 'substitution'],
    ])
    const out = selectStumbleWords([older, latest])
    expect(out.map((x) => x.word)).toEqual(['recurring', 'oneoff'])
    expect(out[0].occurrences).toHaveLength(2)
    expect(out[1].occurrences).toHaveLength(1)
  })

  it('ranks higher-recurrence stumbles above lower-recurrence ones', () => {
    const s1 = session('s1', [['three', 'substitution'], ['two', 'substitution']])
    const s2 = session('s2', [['three', 'substitution'], ['two', 'substitution']])
    const s3 = session('s3', [['three', 'omission'], ['one', 'substitution']])
    const out = selectStumbleWords([s1, s2, s3])
    expect(out.map((x) => x.word)).toEqual(['three', 'two', 'one'])
  })

  it('treats casing and trailing punctuation as the same word', () => {
    const s1 = session('s1', [['Fraudulent', 'substitution']])
    const s2 = session('s2', [['fraudulent,', 'substitution']])
    const out = selectStumbleWords([s1, s2])
    expect(out).toHaveLength(1)
    expect(out[0].occurrences).toHaveLength(2)
    // displays the latest occurrence's casing+form, stripped of trailing punctuation
    expect(out[0].word).toBe('fraudulent')
  })

  it('filters out function/stop words even if marked as substitution', () => {
    const s = session('s1', [
      ['the', 'substitution'],
      ['a', 'omission'],
      ['is', 'substitution'],
      ['fraudulent', 'substitution'],
    ])
    expect(selectStumbleWords([s]).map((x) => x.word)).toEqual(['fraudulent'])
  })

  it('filters out single-character words', () => {
    const s = session('s1', [
      ['I', 'substitution'],
      ['a', 'substitution'],
      ['fraudulent', 'substitution'],
    ])
    expect(selectStumbleWords([s]).map((x) => x.word)).toEqual(['fraudulent'])
  })

  it('only considers sessions within opts.recencyWindow (default 5)', () => {
    const old = [...Array(6)].map((_, i) =>
      session(`old_${i}`, [['stale', 'substitution']]),
    )
    const latest = session('latest', [['fresh', 'substitution']])
    const all = [...old, latest]
    const out = selectStumbleWords(all)
    // 'stale' appears in the 6 oldest sessions but only 4 of them fall in the
    // last-5 window (4 stale + 1 fresh). Recurring threshold (2+) puts stale first.
    expect(out.map((x) => x.word)).toEqual(['stale', 'fresh'])
    expect(out[0].occurrences).toHaveLength(4)
  })

  it('latest session is the LAST element of the sessions array', () => {
    const older = session('s1', [['onlyinold', 'substitution']])
    const latest = session('s2', [['onlyinlatest', 'substitution']])
    // older has only "onlyinold"; latest has only "onlyinlatest"
    // "onlyinlatest" is in latest → kept; "onlyinold" is recurring count 1 not in latest → filtered out
    const out = selectStumbleWords([older, latest])
    expect(out.map((x) => x.word)).toEqual(['onlyinlatest'])
  })

  it('skips correct words even when they appear across many sessions', () => {
    const s1 = session('s1', [['fluent', 'correct']])
    const s2 = session('s2', [['fluent', 'correct'], ['stumble', 'substitution']])
    const out = selectStumbleWords([s1, s2])
    expect(out.map((x) => x.word)).toEqual(['stumble'])
  })

  it('handles sessions with missing or empty word_results gracefully', () => {
    const a = { id: 'a', word_results: null }
    const b = { id: 'b' }
    const c = session('c', [['fraudulent', 'substitution']])
    expect(selectStumbleWords([a, b, c]).map((x) => x.word)).toEqual(['fraudulent'])
  })
})
