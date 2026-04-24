import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuestionPanel from './QuestionPanel'

const mockQuestions = [
  {
    id: 'q1',
    question_text: 'What is the main theme?',
    options: ['Love', 'War', 'Nature', 'Technology'],
    correct_index: 0,
    display_order: 0,
  },
]

describe('QuestionPanel', () => {
  it('renders existing questions', () => {
    render(<QuestionPanel questions={mockQuestions} onSave={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('What is the main theme?')).toBeInTheDocument()
    expect(screen.getByText('Love')).toBeInTheDocument()
  })

  it('shows all 4 option inputs in the add form', () => {
    render(<QuestionPanel questions={[]} onSave={vi.fn()} onDelete={vi.fn()} />)
    const inputs = screen.getAllByPlaceholderText(/Option [A-D]/)
    expect(inputs).toHaveLength(4)
  })

  it('calls onSave with question data when form is submitted', () => {
    const onSave = vi.fn()
    render(<QuestionPanel questions={[]} onSave={onSave} onDelete={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Question text'), {
      target: { value: 'Who is the protagonist?' },
    })
    const options = screen.getAllByPlaceholderText(/Option [A-D]/)
    options.forEach((input, i) => {
      fireEvent.change(input, { target: { value: `Option ${i}` } })
    })
    fireEvent.click(screen.getByRole('button', { name: /add question/i }))

    expect(onSave).toHaveBeenCalledWith({
      question_text: 'Who is the protagonist?',
      options: ['Option 0', 'Option 1', 'Option 2', 'Option 3'],
      correct_index: 0,
    })
  })

  it('calls onDelete when delete is clicked', () => {
    const onDelete = vi.fn()
    render(<QuestionPanel questions={mockQuestions} onSave={vi.fn()} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith('q1')
  })

  it('shows warning when passage already has 5 questions', () => {
    const full = Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`,
      question_text: `Q${i}`,
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      display_order: i,
    }))
    render(<QuestionPanel questions={full} onSave={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/maximum of 5 questions/i)).toBeInTheDocument()
  })
})
