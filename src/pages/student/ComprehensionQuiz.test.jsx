import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ComprehensionQuiz from './ComprehensionQuiz'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'session-abc' }),
}))

// vi.hoisted ensures these are available when the vi.mock factory runs
const { mockRpc, capture } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  capture: { questionsSelectArg: null },
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
      if (table === 'questions') {
        return {
          select: (cols) => {
            capture.questionsSelectArg = cols
            return {
              eq: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: 'q1', question_text: 'Who wrote Hamlet?', options: ['Shakespeare', 'Keats', 'Austen', 'Dickens'], display_order: 0 },
                    { id: 'q2', question_text: 'When was it written?', options: ['1200', '1400', '1600', '1800'], display_order: 1 },
                  ],
                }),
              }),
            }
          },
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
    mockRpc.mockReset()
    mockRpc.mockResolvedValue({ data: null, error: null })
    capture.questionsSelectArg = null
  })

  it('fetches questions without correct_index', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))
    expect(capture.questionsSelectArg).not.toContain('correct_index')
    expect(capture.questionsSelectArg).toContain('id')
    expect(capture.questionsSelectArg).toContain('question_text')
    expect(capture.questionsSelectArg).toContain('options')
    expect(capture.questionsSelectArg).toContain('display_order')
  })

  it('calls grade_comprehension RPC on submit with session_id and raw answers', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))

    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('grade_comprehension', {
      p_session_id: 'session-abc',
      p_answers: [
        { question_id: 'q1', selected_index: 0 },
        { question_id: 'q2', selected_index: 2 },
      ],
    }))
  })

  it('navigates to report after successful submission', async () => {
    render(<ComprehensionQuiz />)
    await waitFor(() => screen.getByText('Who wrote Hamlet?'))

    fireEvent.click(screen.getByLabelText('Shakespeare'))
    fireEvent.click(screen.getByLabelText('1600'))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/student/report/session-abc', { replace: true }
    ))
  })
})
