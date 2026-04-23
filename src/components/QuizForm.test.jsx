import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuizForm from './QuizForm'

const questions = [
  { id: 'q1', question_text: 'Who wrote Hamlet?', options: ['Shakespeare', 'Keats', 'Austen', 'Dickens'], correct_index: 0, display_order: 0 },
  { id: 'q2', question_text: 'When was it written?', options: ['1200', '1400', '1600', '1800'], correct_index: 2, display_order: 1 },
]

describe('QuizForm', () => {
  it('renders all questions and options', () => {
    render(<QuizForm questions={questions} onSubmit={vi.fn()} />)
    expect(screen.getByText('Who wrote Hamlet?')).toBeInTheDocument()
    expect(screen.getByText('When was it written?')).toBeInTheDocument()
    expect(screen.getByText('Shakespeare')).toBeInTheDocument()
    expect(screen.getByText('1600')).toBeInTheDocument()
  })

  it('submit button is disabled until all questions answered', () => {
    render(<QuizForm questions={questions} onSubmit={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /submit/i })
    expect(btn).toBeDisabled()

    // answer only first question
    fireEvent.click(screen.getByLabelText('Shakespeare'))
    expect(btn).toBeDisabled()

    // answer second question → now enabled
    fireEvent.click(screen.getByLabelText('1600'))
    expect(btn).not.toBeDisabled()
  })

  it('calls onSubmit with selected answers', () => {
    const onSubmit = vi.fn()
    render(<QuizForm questions={questions} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(onSubmit).toHaveBeenCalledWith([
      { question_id: 'q1', selected_index: 0 },
      { question_id: 'q2', selected_index: 2 },
    ])
  })
})
