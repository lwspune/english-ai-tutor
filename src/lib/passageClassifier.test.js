import { describe, it, expect } from 'vitest'
import { classifyPassages, MASTERY_THRESHOLD } from './passageClassifier'

const p = (id) => ({ id, title: `Passage ${id}`, word_count: 100, grade_level: 10 })
const s = (passageId, score) => ({ passage_id: passageId, score_accuracy: score })

describe('classifyPassages', () => {
  it('puts a never-attempted passage in todo', () => {
    const { todo, retry } = classifyPassages([p(1)], [])
    expect(todo).toHaveLength(1)
    expect(todo[0].id).toBe(1)
    expect(retry).toHaveLength(0)
  })

  it('hides a mastered passage (score >= MASTERY_THRESHOLD)', () => {
    const { todo, retry } = classifyPassages([p(1)], [s(1, MASTERY_THRESHOLD)])
    expect(todo).toHaveLength(0)
    expect(retry).toHaveLength(0)
  })

  it('hides a passage mastered on a later attempt', () => {
    const { todo, retry } = classifyPassages([p(1)], [s(1, 60), s(1, 85)])
    expect(todo).toHaveLength(0)
    expect(retry).toHaveLength(0)
  })

  it('puts an under-threshold passage with attempts remaining in retry', () => {
    const { todo, retry } = classifyPassages([p(1)], [s(1, 60)])
    expect(todo).toHaveLength(0)
    expect(retry).toHaveLength(1)
    expect(retry[0].id).toBe(1)
    expect(retry[0].bestScore).toBe(60)
    expect(retry[0].attemptsUsed).toBe(1)
  })

  it('hides an exhausted passage still under threshold', () => {
    const sessions = [s(1, 50), s(1, 55), s(1, 60)]
    const { todo, retry } = classifyPassages([p(1)], sessions)
    expect(todo).toHaveLength(0)
    expect(retry).toHaveLength(0)
  })

  it('uses the best score across multiple attempts', () => {
    const { retry } = classifyPassages([p(1)], [s(1, 50), s(1, 70)])
    expect(retry[0].bestScore).toBe(70)
    expect(retry[0].attemptsUsed).toBe(2)
  })

  it('handles a mix of todo, retry, and hidden passages', () => {
    const passages = [p(1), p(2), p(3), p(4)]
    const sessions = [
      s(2, 90),           // mastered → hidden
      s(3, 60),           // under threshold, 1 attempt → retry
      s(4, 50), s(4, 55), s(4, 58), // exhausted → hidden
    ]
    const { todo, retry } = classifyPassages(passages, sessions)
    expect(todo.map(x => x.id)).toEqual([1])
    expect(retry.map(x => x.id)).toEqual([3])
  })

  it('preserves passage order within each bucket', () => {
    const passages = [p(1), p(2), p(3)]
    const sessions = [s(2, 50)]
    const { todo, retry } = classifyPassages(passages, sessions)
    expect(todo.map(x => x.id)).toEqual([1, 3])
    expect(retry.map(x => x.id)).toEqual([2])
  })
})
