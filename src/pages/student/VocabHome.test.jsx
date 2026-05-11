import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import VocabHome from './VocabHome'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const { mockProfile, mockProgress, mockTotal } = vi.hoisted(() => ({
  mockProfile: { value: { id: 's1', grade: '11' } },
  mockProgress: { value: [] },
  mockTotal: { value: 865 },
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile.value }),
}))

vi.mock('../../components/BottomNav', () => ({
  default: () => <div data-testid="bottom-nav" />,
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'vocabulary_words') {
        return {
          select: () => Promise.resolve({ count: mockTotal.value, error: null }),
        }
      }
      if (table === 'student_word_progress') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: mockProgress.value, error: null }),
          }),
        }
      }
      return {}
    },
  },
}))

beforeEach(() => {
  mockProfile.value = { id: 's1', grade: '11' }
  mockProgress.value = []
  mockTotal.value = 865
  mockNavigate.mockReset()
})

describe('VocabHome — grade gating', () => {
  it('shows locked state for grade 9', async () => {
    mockProfile.value = { id: 's1', grade: '9' }
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByText(/unlocks in grade 11/i)).toBeInTheDocument()
    })
  })

  it('shows locked state for grade 10', async () => {
    mockProfile.value = { id: 's1', grade: '10' }
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByText(/unlocks in grade 11/i)).toBeInTheDocument()
    })
  })

  it('shows practice UI for grade 11', async () => {
    mockProfile.value = { id: 's1', grade: '11' }
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start practice/i })).toBeInTheDocument()
    })
  })

  it('shows practice UI for grade 12', async () => {
    mockProfile.value = { id: 's1', grade: '12' }
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start practice/i })).toBeInTheDocument()
    })
  })

  it('shows practice UI for MBA', async () => {
    mockProfile.value = { id: 's1', grade: 'MBA' }
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start practice/i })).toBeInTheDocument()
    })
  })
})

describe('VocabHome — counts', () => {
  it('shows mastered / total when fresh student', async () => {
    mockProgress.value = []
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByTestId('mastered-count')).toHaveTextContent('0')
      expect(screen.getByTestId('total-count')).toHaveTextContent('865')
    })
  })

  it('shows mastered count correctly', async () => {
    mockProgress.value = [
      { mastered_at: '2026-05-01T00:00:00Z', next_review_at: '2026-06-01T00:00:00Z' },
      { mastered_at: '2026-05-02T00:00:00Z', next_review_at: '2026-06-02T00:00:00Z' },
      { mastered_at: null, next_review_at: '2026-04-01T00:00:00Z' },
    ]
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByTestId('mastered-count')).toHaveTextContent('2')
    })
  })

  it('shows due count from past-due progress rows', async () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    const future = new Date(Date.now() + 86400000).toISOString()
    mockProgress.value = [
      { mastered_at: null, next_review_at: past },
      { mastered_at: null, next_review_at: past },
      { mastered_at: null, next_review_at: future },
      { mastered_at: '2026-05-01T00:00:00Z', next_review_at: past },
    ]
    render(<VocabHome />)
    await waitFor(() => {
      expect(screen.getByTestId('due-count')).toHaveTextContent('2')
    })
  })
})

describe('VocabHome — practice button', () => {
  it('Start Practice navigates to /student/vocab/practice', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    mockProgress.value = []
    render(<VocabHome />)
    const btn = await screen.findByRole('button', { name: /start practice/i })
    await user.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith('/student/vocab/practice')
  })

  it('Start Practice disabled when no due and all words seen+mastered', async () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    mockTotal.value = 3
    mockProgress.value = [
      { mastered_at: past, next_review_at: past },
      { mastered_at: past, next_review_at: past },
      { mastered_at: past, next_review_at: past },
    ]
    render(<VocabHome />)
    const btn = await screen.findByRole('button', { name: /start practice/i })
    expect(btn).toBeDisabled()
  })

  it('Start Practice enabled when due > 0', async () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    mockTotal.value = 100
    mockProgress.value = [{ mastered_at: null, next_review_at: past }]
    render(<VocabHome />)
    const btn = await screen.findByRole('button', { name: /start practice/i })
    expect(btn).not.toBeDisabled()
  })

  it('Start Practice enabled when new words available even if 0 due', async () => {
    mockTotal.value = 865
    mockProgress.value = []
    render(<VocabHome />)
    const btn = await screen.findByRole('button', { name: /start practice/i })
    expect(btn).not.toBeDisabled()
  })
})
