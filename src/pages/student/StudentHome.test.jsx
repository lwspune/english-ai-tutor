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

vi.mock('../../components/BottomNav', () => ({
  default: () => <div data-testid="bottom-nav" />,
}))

const { mockComputeStreak } = vi.hoisted(() => ({
  mockComputeStreak: vi.fn(() => 0),
}))

vi.mock('../../lib/streak', () => ({
  computeStreak: (...args) => mockComputeStreak(...args),
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
  mockComputeStreak.mockReturnValue(0)
  passagesRef.data = [GRADE_10_PASSAGE, ALL_GRADES_PASSAGE]
  sessionsRef.data = []
  localStorage.clear()
})

// ─── Next Up hero card ────────────────────────────────────────────────────────

describe('StudentHome — Next Up hero card', () => {
  it('shows the first todo passage as Next Up', async () => {
    passagesRef.data = [GRADE_10_PASSAGE, ALL_GRADES_PASSAGE]
    sessionsRef.data = []
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Next Up'))
    expect(screen.getByText('Grade 10 Passage')).toBeInTheDocument()
  })

  it('shows a retry passage when todo is empty', async () => {
    const passage = { id: 'rp1', title: 'Retry Passage', word_count: 100, grade_level: 10, difficulty: 'easy' }
    const session = {
      id: 'rs1', passage_id: 'rp1', score_accuracy: 60, score_wpm: 120,
      created_at: new Date(2026, 3, 1).toISOString(), passages: { title: 'Retry Passage' },
    }
    passagesRef.data = [passage]
    sessionsRef.data = [session]
    render(<StudentHome />)
    await waitFor(() => screen.getByText('Keep Practising'))
    expect(screen.getByText('Retry Passage')).toBeInTheDocument()
  })

  it('does not show Next Up when daily limit is reached', async () => {
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    sessionsRef.data = Array.from({ length: 5 }, (_, i) => ({
      id: `ts${i}`, passage_id: `other${i}`, score_accuracy: 80, score_wpm: 140,
      created_at: new Date(`${todayIST}T10:00:00+05:30`).toISOString(),
      passages: { title: `Other ${i}` },
    }))
    passagesRef.data = [GRADE_10_PASSAGE]
    render(<StudentHome />)
    await waitFor(() => screen.getByText(/daily limit reached/i))
    expect(screen.queryByText('Next Up')).not.toBeInTheDocument()
    expect(screen.queryByText('Keep Practising')).not.toBeInTheDocument()
  })

  it('does not show Next Up when all passages are mastered', async () => {
    const passage = { id: 'mp1', title: 'Mastered Passage', word_count: 100, grade_level: 10, difficulty: 'easy' }
    const session = {
      id: 'ms1', passage_id: 'mp1', score_accuracy: 85, score_wpm: 150,
      created_at: new Date(2026, 3, 1).toISOString(), passages: { title: 'Mastered Passage' },
    }
    passagesRef.data = [passage]
    sessionsRef.data = [session]
    render(<StudentHome />)
    await waitFor(() => screen.queryByText('Next Up') === null)
    expect(screen.queryByText('Next Up')).not.toBeInTheDocument()
  })
})

// ─── Status bar ───────────────────────────────────────────────────────────────

describe('StudentHome — status bar', () => {
  it('shows streak count when streak is greater than 0', async () => {
    mockComputeStreak.mockReturnValue(5)
    render(<StudentHome />)
    await waitFor(() => screen.getByText(/5-day streak/i))
  })

  it('shows today count chip', async () => {
    render(<StudentHome />)
    await waitFor(() => screen.getByText(/0\/5 today/i))
  })
})

// ─── Tabs ─────────────────────────────────────────────────────────────────────

describe('StudentHome — tabs', () => {
  it('shows To Read tab as active by default', async () => {
    render(<StudentHome />)
    await waitFor(() => screen.getByRole('button', { name: /to read/i }))
    expect(screen.getByRole('button', { name: /to read/i })).toBeInTheDocument()
  })

  it('clicking Practise tab shows retry passages', async () => {
    const passage = { id: 'rp1', title: 'Retry Passage', word_count: 100, grade_level: 10, difficulty: 'easy' }
    const session = {
      id: 'rs1', passage_id: 'rp1', score_accuracy: 60, score_wpm: 120,
      created_at: new Date(2026, 3, 1).toISOString(), passages: { title: 'Retry Passage' },
    }
    passagesRef.data = [passage]
    sessionsRef.data = [session]
    render(<StudentHome />)
    await waitFor(() => screen.getByRole('button', { name: /practise/i }))
    fireEvent.click(screen.getByRole('button', { name: /practise/i }))
    expect(document.querySelector('[data-testid="retry-row"]')).toBeInTheDocument()
  })

  it('clicking History tab shows recent sessions', async () => {
    sessionsRef.data = [makeSession(0)]
    render(<StudentHome />)
    await waitFor(() => screen.getByRole('button', { name: /history/i }))
    fireEvent.click(screen.getByRole('button', { name: /history/i }))
    await waitFor(() => document.querySelector('[data-testid="session-row"]'))
    expect(document.querySelector('[data-testid="session-row"]')).toBeInTheDocument()
  })
})

// ─── Difficulty badge ─────────────────────────────────────────────────────────

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

// ─── Grade filter ─────────────────────────────────────────────────────────────

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

// ─── Assigned passages pagination (To Read tab — default) ────────────────────

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
    // Hero hides on page > 0; displayTodo = Passages 1-6, page 1 = Passage 6 only
    expect(screen.queryByText('Passage 0')).not.toBeInTheDocument()
    expect(screen.queryByText('Passage 1')).not.toBeInTheDocument()
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

// ─── Keep Practising pagination (Practise tab) ────────────────────────────────

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

  async function openPractiseTab() {
    await waitFor(() => screen.getByRole('button', { name: /practise/i }))
    fireEvent.click(screen.getByRole('button', { name: /practise/i }))
  }

  it('shows at most 5 retry passages on the first page', async () => {
    const { passages, sessions } = makeRetrySetup(8)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await openPractiseTab()
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    expect(document.querySelectorAll('[data-testid="retry-row"]')).toHaveLength(5)
  })

  it('does not show Next button when 5 or fewer retry passages', async () => {
    const { passages, sessions } = makeRetrySetup(4)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await openPractiseTab()
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    expect(screen.queryByTestId('retry-next')).not.toBeInTheDocument()
  })

  it('shows Next button when more than 5 retry passages', async () => {
    const { passages, sessions } = makeRetrySetup(7)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await openPractiseTab()
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    expect(screen.getByTestId('retry-next')).toBeInTheDocument()
  })

  it('clicking Next shows the second page of retry passages', async () => {
    const { passages, sessions } = makeRetrySetup(7)
    passagesRef.data = passages
    sessionsRef.data = sessions
    render(<StudentHome />)
    await openPractiseTab()
    await waitFor(() => document.querySelector('[data-testid="retry-row"]'))
    fireEvent.click(screen.getByTestId('retry-next'))
    expect(document.querySelectorAll('[data-testid="retry-row"]')).toHaveLength(2)
  })
})

// ─── Recent sessions pagination (History tab) ─────────────────────────────────

describe('StudentHome — recent sessions pagination', () => {
  async function openHistoryTab() {
    await waitFor(() => screen.getByRole('button', { name: /history/i }))
    fireEvent.click(screen.getByRole('button', { name: /history/i }))
  }

  it('shows at most 5 sessions on the first page', async () => {
    sessionsRef.data = Array.from({ length: 8 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await openHistoryTab()
    await waitFor(() => document.querySelector('[data-testid="session-row"]'))
    expect(document.querySelectorAll('[data-testid="session-row"]')).toHaveLength(5)
  })

  it('does not show sessions Next button when 5 or fewer sessions', async () => {
    sessionsRef.data = Array.from({ length: 3 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await openHistoryTab()
    await waitFor(() => document.querySelector('[data-testid="session-row"]'))
    expect(screen.queryByTestId('sessions-next')).not.toBeInTheDocument()
  })

  it('shows page indicator for sessions when paginated', async () => {
    sessionsRef.data = Array.from({ length: 8 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await openHistoryTab()
    await waitFor(() => document.querySelector('[data-testid="session-row"]'))
    expect(screen.getByTestId('sessions-page-indicator')).toBeInTheDocument()
  })

  it('clicking sessions Next shows the next page', async () => {
    sessionsRef.data = Array.from({ length: 8 }, (_, i) => makeSession(i))
    render(<StudentHome />)
    await openHistoryTab()
    await waitFor(() => document.querySelector('[data-testid="session-row"]'))
    expect(document.querySelectorAll('[data-testid="session-row"]')).toHaveLength(5)
    fireEvent.click(screen.getByTestId('sessions-next'))
    expect(document.querySelectorAll('[data-testid="session-row"]')).toHaveLength(3)
  })
})
