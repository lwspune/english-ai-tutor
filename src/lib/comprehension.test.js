import { describe, it, expect } from 'vitest'
import { gradeAnswers } from './comprehension'

describe('gradeAnswers', () => {
  const questions = [
    { id: 'q1', correct_index: 0 },
    { id: 'q2', correct_index: 2 },
    { id: 'q3', correct_index: 1 },
  ]

  it('returns 100 when all answers are correct', () => {
    const answers = [
      { question_id: 'q1', selected_index: 0 },
      { question_id: 'q2', selected_index: 2 },
      { question_id: 'q3', selected_index: 1 },
    ]
    const result = gradeAnswers(questions, answers)
    expect(result.score).toBe(100)
    expect(result.answers[0].is_correct).toBe(true)
    expect(result.answers[1].is_correct).toBe(true)
    expect(result.answers[2].is_correct).toBe(true)
  })

  it('returns 0 when all answers are wrong', () => {
    const answers = [
      { question_id: 'q1', selected_index: 1 },
      { question_id: 'q2', selected_index: 0 },
      { question_id: 'q3', selected_index: 3 },
    ]
    const result = gradeAnswers(questions, answers)
    expect(result.score).toBe(0)
    expect(result.answers.every(a => !a.is_correct)).toBe(true)
  })

  it('returns rounded percentage for partial score', () => {
    const answers = [
      { question_id: 'q1', selected_index: 0 }, // correct
      { question_id: 'q2', selected_index: 0 }, // wrong
      { question_id: 'q3', selected_index: 3 }, // wrong
    ]
    const result = gradeAnswers(questions, answers)
    expect(result.score).toBe(33)
  })

  it('returns 100 for a single correct answer', () => {
    const single = [{ id: 'q1', correct_index: 2 }]
    const answers = [{ question_id: 'q1', selected_index: 2 }]
    expect(gradeAnswers(single, answers).score).toBe(100)
  })
})
