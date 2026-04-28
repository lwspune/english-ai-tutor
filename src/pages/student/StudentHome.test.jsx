import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import StudentHome from './StudentHome'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'student-1', full_name: 'Test Student', grade: 10 },
    signOut: vi.fn(),
  }),
}))

vi.mock('../../lib/streak', () => ({
  computeStreak: () => 0,
}))

vi.mock('../../lib/weeklySummary', () => ({
  shouldShowWeeklySummary: () => false,
  markWeeklySummaryShown: vi.fn(),
  computeWeeklySummaryData: vi.fn(),
}))

const GRADE_10_PASSAGE   = { id: 'p10',  title: 'Grade 10 Passage',   word_count: 100, grade_level: 10,   difficulty: 'moderate' }
const GRADE_9_PASSAGE    = { id: 'p9',   title: 'Grade 9 Passage',    word_count: 80,  grade_level: 9,    difficulty: 'easy' }
const ALL_GRADES_PASSAGE = { id: 'pall', title: 'All Grades Passage', word_count: 90,  grade_level: null, difficulty: 'hard' }

function makePassage(i) {
  return { id: `p${i}`, title: `Passage ${i}`, word_count: 100, grade_level: 10, difficulty: 'easy' }
}
function makeSession(i) {
  return {
    id: `s${i}`,
    passage_id: `p${i}`,
    score_accuracy: 80,
    score_wpm: 140,
    created_at: new Date(2026, 3, 20 - i).toISOString(),
    passages: { title: `Passage ${i}` },
  }
}

const { mockPassagesOr, passagesRef, sessionsRef } = vi.hoisted(() => ({
  mockPassagesOr: vi.fn(),
  passagesRef: { data: [] },
  sessionsRef: { data: [] },
}))

vi.mock('../../lib/supabase', () => {
  const makeOrder = (ref) => ({ order: () => Promise.resolve({ data: ref.data }) })

  return {
    supabase: {
      from: (table) => {
        if (table === 'passages') {
          return {
            select: () => ({
              or: (filter) => {
                mockPassagesOr(filter)
                return makeOrder(passagesRef)
              },
            }),
          }
        }
        if (table === 'sessions') {
          return {
            select: () => ({
              eq: () => makeOrder(sessionsRef),
            }),
          }
        }
        if (table === 'app_settings') {
          return {
            select: () => ({ single: () => Promise.resolve({ data: { daily_session_limit: 5 } }) }),
          }
        }
        return {}
      },
    },
  }
})

beforeEach(() => {
  mockPassagesOr.mockClear()
  mockNavigate.mockReset()
  passagesRef.data = [GRADE_10_PASSAGE, ALL_GRADES_PASSAGE]
  sessionsRef.data = []
  localStorage.clear()
})

describe('StudentHome — difficulty badge', () => {
  it('shows the difficulty label on a todo passage card', async () => {
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Grade 10 Passage'))
    expect(screen.getByText(/moderate/i)).toBeInTheDocument()
  })

  it('shows the difficulty label on an all-grades passage card', async () => {
    render(<StudentHome />)
    await waitFor(() => screen.getByText('All Grades Passage'))
    expect(screen.getByText(/hard/i)).toBeInTheDocument()
  })
})

describe('StudentHome — grade filter', () => {
  it('queries passages with a grade filter matching the student grade', async () => {
    render(<StudentHome />)
    await waitFor(() => expect(mockPassagesOr).toHaveBeenCalled())
    expect(mockPassagesOr).toHaveBeenCalledWith('grade_level.eq.10,grade_level.is.null')
  })

  it('shows passages returned for the student grade', async () => {
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Grade 10 Passage'))
    expect(screen.getByText('All Grades Passage')).toBeInTheDocument()
  })
})

describe('StudentHome — assigned passages pagination', () => {
  it('shows at most 5 passages on the first page', async () => {
    passagesRef.data = Array.from({ length: 8 }, (_, i) => makePassage(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    const buttons = screen.getAllByRole('button', { name: /start reading/i })
    expect(buttons).toHaveLength(5)
  })

  it('does not show a Next button when there are 5 or fewer passages', async () => {
    passagesRef.data = Array.from({ length: 4 }, (_, i) => makePassage(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })

  it('shows a Next button when there are more than 5 passages', async () => {
    passagesRef.data = Array.from({ length: 7 }, (_, i) => makePassage(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('clicking Next shows the second page of passages', async () => {
    passagesRef.data = Array.from({ length: 7 }, (_, i) => makePassage(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.queryByText('Passage 0')).not.toBeInTheDocument()
    expect(screen.getByText('Passage 5')).toBeInTheDocument()
    expect(screen.getByText('Passage 6')).toBeInTheDocument()
  })

  it('Previous button is disabled on the first page', async () => {
    passagesRef.data = Array.from({ length: 7 }, (_, i) => makePassage(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('clicking Next then Previous returns to the first page', async () => {
    passagesRef.data = Array.from({ length: 7 }, (_, i) => makePassage(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(screen.getByText('Passage 0')).toBeInTheDocument()
  })
})

describe('StudentHome — keep practising pagination', () => {
  function makeRetrySetup(count) {
    const passages = Array.from({ length: count }, (_, i) => ({
      id: `rp${i}`, title: `Retry Passage ${i}`, word_count: 100, grade_level: 10, difficulty: 'easy',
    }))
    const sessions = passages.map((p, i) => ({
      id: `rs${i}`, passage_id: p.id, score_accuracy: 60, score_wpm: 120,
      created_at: new Date(2026, 3, 10 - i).toISOString(), passages: { title: p.title },
    }))
    return { passages, sessions }
  }

  it('shows at most 5 retry passages on the first page', async () => {
    const { passages, sessions } = makeRetrySetup(8)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    expect(document.querySelectorAll('[data-testid="retry-row"]')).toHaveLength(5)
  })

  it('does not show Next button when 5 or fewer retry passages', async () => {
    const { passages, sessions } = makeRetrySetup(4)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })

  it('shows Next button when more than 5 retry passages', async () => {
    const { passages, sessions } = makeRetrySetup(7)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    expect(screen.getByTestId('retry-next')).toBeInTheDocument()
  })

  it('clicking Next shows the second page of retry passages', async () => {
    const { passages, sessions } = makeRetrySetup(7)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    fireEvent.click(screen.getByTestId('retry-next'))
    expect(document.querySelectorAll('[data-testid="retry-row"]')).toHaveLength(2)
  })
})

describe('StudentHome — recent sessions pagination', () => {
  it('shows at most 5 sessions on the first page', async () => {
    sessionsRef.data = Array.from({ length: 8 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    const sessionItems = screen.getAllByText(/^Passage \d+$/).filter(
      el => el.closest('[data-testid="session-row"]')
    )
    // There should be exactly 5 visible session rows
    const sessionRows = document.querySelectorAll('[data-testid="session-row"]')
    expect(sessionRows).toHaveLength(5)
  })

  it('does not show sessions Next button when 5 or fewer sessions', async () => {
    sessionsRef.data = Array.from({ length: 3 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    // Only one Next button should be absent (none at all since passages are also ≤5)
    expect(screen.queryAllByRole('button', { name: /next/i })).toHaveLength(0)
  })

  it('shows page indicator for sessions when paginated', async () => {
    sessionsRef.data = Array.from({ length: 8 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    expect(screen.getByTestId('sessions-page-indicator')).toBeInTheDocument()
  })

  it('clicking sessions Next shows the next page', async () => {
    sessionsRef.data = Array.from({ length: 8 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Passage 0'))
    const sessionRows0 = document.querySelectorAll('[data-testid="session-row"]')
    expect(sessionRows0).toHaveLength(5)
    fireEvent.click(screen.getByTestId('sessions-next'))
    const sessionRows1 = document.querySelectorAll('[data-testid="session-row"]')
    expect(sessionRows1).toHaveLength(3) // 8 total, 5 on first page, 3 on second
  })
})
