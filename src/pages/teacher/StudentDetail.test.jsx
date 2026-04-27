import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentDetail from './StudentDetail'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ studentId: 'student-1' }),
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'teacher-1' } }),
}))

vi.mock('../../components/PerformanceCharts', () => ({
  MetricCard: () => null,
}))

const AI_FEEDBACK = JSON.stringify({
  wentWell: 'Great accuracy on most words.',
  focusOn: 'Work on your pace.',
  tip: 'Read aloud daily.',
  practiseWords: ['therefore', 'consequently'],
})

const RULE_FEEDBACK = 'You substituted 3 words. Focus on reading each word carefully.'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { id: 'student-1', full_name: 'Aarav Shah', grade: '12' } }),
            }),
          }),
        }
      }
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [
                  {
                    id: 'sess-1', created_at: '2026-04-01T10:00:00Z',
                    score_accuracy: 85, score_wpm: 120, score_phrasing: 70, score_fluency: 70,
                    count_omissions: 2, count_substitutions: 3,
                    score_comprehension: null, comprehension_answers: null,
                    word_results: [], feedback: AI_FEEDBACK,
                    passages: { title: 'The Gift of the Magi' },
                  },
                  {
                    id: 'sess-2', created_at: '2026-04-02T10:00:00Z',
                    score_accuracy: 90, score_wpm: 140, score_phrasing: 80, score_fluency: 80,
                    count_omissions: 1, count_substitutions: 1,
                    score_comprehension: null, comprehension_answers: null,
                    word_results: [], feedback: RULE_FEEDBACK,
                    passages: { title: 'The Gift of the Magi' },
                  },
                ],
              }),
            }),
          }),
          rpc: () => Promise.resolve({}),
        }
      }
      return {}
    },
    rpc: () => Promise.resolve({}),
  },
}))

describe('StudentDetail — feedback panel', () => {
  beforeEach(() => mockNavigate.mockReset())

  it('shows a Feedback button for each session', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))
    const buttons = screen.getAllByRole('button', { name: /feedback/i })
    expect(buttons).toHaveLength(2)
  })

  it('expands AI feedback when the button is clicked', async () => {
    const user = userEvent.setup()
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))

    const [firstBtn] = screen.getAllByRole('button', { name: /feedback/i })
    await user.click(firstBtn)

    expect(screen.getByText('Great accuracy on most words.')).toBeInTheDocument()
    expect(screen.getByText('Work on your pace.')).toBeInTheDocument()
    expect(screen.getByText('Read aloud daily.')).toBeInTheDocument()
  })

  it('expands plain-text feedback when the button is clicked', async () => {
    const user = userEvent.setup()
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))

    const buttons = screen.getAllByRole('button', { name: /feedback/i })
    await user.click(buttons[1])

    expect(screen.getByText(RULE_FEEDBACK)).toBeInTheDocument()
  })

  it('collapses feedback when the button is clicked again', async () => {
    const user = userEvent.setup()
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))

    const [firstBtn] = screen.getAllByRole('button', { name: /feedback/i })
    await user.click(firstBtn)
    expect(screen.getByText('Great accuracy on most words.')).toBeInTheDocument()

    await user.click(firstBtn)
    expect(screen.queryByText('Great accuracy on most words.')).not.toBeInTheDocument()
  })
})
