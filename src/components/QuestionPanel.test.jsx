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
    render(<QuestionPanel questions={full} onSave={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByText(/maximum of 5 questions/i)).toBeInTheDocument()
  })

  it('shows an Edit button on each question row', () => {
    render(<QuestionPanel questions={mockQuestions} onSave={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('clicking Edit pre-fills the form with the question data', () => {
    render(<QuestionPanel questions={mockQuestions} onSave={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByPlaceholderText('Question text').value).toBe('What is the main theme?')
    expect(screen.getAllByPlaceholderText(/Option [A-D]/)[0].value).toBe('Love')
    expect(screen.getAllByPlaceholderText(/Option [A-D]/)[1].value).toBe('War')
  })

  it('submitting an edited question calls onUpdate, not onSave', () => {
    const onSave = vi.fn()
    const onUpdate = vi.fn()
    render(<QuestionPanel questions={mockQuestions} onSave={onSave} onDelete={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByPlaceholderText('Question text'), {
      target: { value: 'Updated question?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(onUpdate).toHaveBeenCalledWith('q1', expect.objectContaining({ question_text: 'Updated question?' }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Cancel edit resets form and returns to add mode', () => {
    render(<QuestionPanel questions={mockQuestions} onSave={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByPlaceholderText('Question text').value).toBe('What is the main theme?')
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByPlaceholderText('Question text').value).toBe('')
  })

  it('shows edit form even when at 5-question limit', () => {
    const full = Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`,
      question_text: `Q${i}`,
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      display_order: i,
    }))
    render(<QuestionPanel questions={full} onSave={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    expect(screen.getByPlaceholderText('Question text')).toBeInTheDocument()
    expect(screen.queryByText(/maximum of 5 questions/i)).not.toBeInTheDocument()
  })
})
