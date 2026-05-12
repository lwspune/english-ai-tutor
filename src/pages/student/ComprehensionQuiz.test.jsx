import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ComprehensionQuiz from './ComprehensionQuiz'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'session-abc' }),
}))

// vi.hoisted ensures these are available when the vi.mock factory runs
const QUESTION_ROWS = [
  { id: 'q1', question_text: 'Who wrote Hamlet?', options: ['Shakespeare', 'Keats', 'Austen', 'Dickens'], display_order: 0, correct_index: null },
  { id: 'q2', question_text: 'When was it written?',  options: ['1200', '1400', '1600', '1800'],          display_order: 1, correct_index: null },
]

const { mockRpc, mockFeedback } = vi.hoisted(() => {
  const QUESTION_ROWS_HOISTED = [
    { id: 'q1', question_text: 'Who wrote Hamlet?', options: ['Shakespeare', 'Keats', 'Austen', 'Dickens'], display_order: 0, correct_index: null },
    { id: 'q2', question_text: 'When was it written?',  options: ['1200', '1400', '1600', '1800'],          display_order: 1, correct_index: null },
  ]
  return {
    mockRpc: vi.fn((fn) => {
      if (fn === 'get_questions_for_session') {
        return Promise.resolve({ data: QUESTION_ROWS_HOISTED, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    mockFeedback: vi.fn(),
  }
})

vi.mock('../../lib/feedback', () => ({
  feedback: (...args) => mockFeedback(...args),
  prefersReducedMotion: () => false,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: { passage_id: 'passage-1', comprehension_answers: null },
              }),
            }),
          }),
        }
      }
      if (table === 'passages') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { title: 'Hamlet', content: 'To be or not to be.' } }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }
    },
    rpc: mockRpc,
  },
}))

describe('ComprehensionQuiz', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    // Re-stash the dispatch behaviour so per-test .mockResolvedValue calls
    // don't trash the shared get_questions_for_session shape.
    mockRpc.mockReset()
    mockRpc.mockImplementation((fn) => {
      if (fn === 'get_questions_for_session') {
        return Promise.resolve({ data: QUESTION_ROWS, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    mockFeedback.mockClear()
  })

  it('fetches questions through get_questions_for_session RPC (correct_index is server-gated)', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))
    const call = mockRpc.mock.calls.find(args => args[0] === 'get_questions_for_session')
    expect(call).toBeTruthy()
    expect(call[1]).toEqual({ p_session_id: 'session-abc' })
  })

  it('calls grade_comprehension RPC on submit with session_id and raw answers', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))

    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('grade_comprehension', {
      p_session_id: 'session-abc',
      p_answers: [
        { question_id: 'q1', selected_index: 0 },
        { question_id: 'q2', selected_index: 2 },
      ],
    }))
  })

  it('fires feedback("swoosh") when the submit is confirmed', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))
    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }))
    expect(mockFeedback).toHaveBeenCalledWith('swoosh')
  })

  it('does NOT navigate away when grade_comprehension RPC returns an error', async () => {
    // RPC dispatch — return error for grade_comprehension specifically
    mockRpc.mockReset()
    mockRpc.mockImplementation((fn) => {
      if (fn === 'get_questions_for_session') {
        return Promise.resolve({ data: QUESTION_ROWS, error: null })
      }
      if (fn === 'grade_comprehension') {
        return Promise.resolve({ data: null, error: { message: 'Duplicate question_id' } })
      }
      return Promise.resolve({ data: null, error: null })
    })
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))
    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }))

    // Should NOT navigate to report
    await new Promise(r => setTimeout(r, 50))
    expect(mockNavigate).not.toHaveBeenCalledWith('/student/report/session-abc', { replace: true })
    // Should surface error to the student
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('navigates to report after successful submission', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))

    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/student/report/session-abc', { replace: true }
    ))
  })
})
