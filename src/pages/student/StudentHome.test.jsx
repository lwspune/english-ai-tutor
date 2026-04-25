import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

const GRADE_10_PASSAGE   = { id: 'p10',  title: 'Grade 10 Passage',   word_count: 100, grade_level: 10,   difficulty: 'moderate' }
const GRADE_9_PASSAGE    = { id: 'p9',   title: 'Grade 9 Passage',    word_count: 80,  grade_level: 9,    difficulty: 'easy' }
const ALL_GRADES_PASSAGE = { id: 'pall', title: 'All Grades Passage', word_count: 90,  grade_level: null, difficulty: 'hard' }

const { mockPassagesOr } = vi.hoisted(() => ({
  mockPassagesOr: vi.fn(),
}))

vi.mock('../../lib/supabase', () => {
  const makeOrder = (data) => ({ order: () => Promise.resolve({ data }) })

  return {
    supabase: {
      from: (table) => {
        if (table === 'passages') {
          return {
            select: () => ({
              or: (filter) => {
                mockPassagesOr(filter)
                return makeOrder([GRADE_10_PASSAGE, ALL_GRADES_PASSAGE])
              },
            }),
          }
        }
        if (table === 'sessions') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [] }),
              }),
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

describe('StudentHome — difficulty badge', () => {
  beforeEach(() => {
    mockPassagesOr.mockClear()
    mockNavigate.mockReset()
  })

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
  beforeEach(() => {
    mockPassagesOr.mockClear()
    mockNavigate.mockReset()
  })

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
