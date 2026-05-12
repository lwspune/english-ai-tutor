import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VocabPractice from './VocabPractice'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../components/BottomNav', () => ({
  default: () => <div data-testid="bottom-nav" />,
}))

const { mockProfile, mockWords, mockProgress, mockRpc, mockFeedback, mockAwardMilestone } = vi.hoisted(() => ({
  mockProfile: { value: { id: 's1', grade: '11' } },
  mockWords: { value: [] },
  mockProgress: { value: [] },
  mockRpc: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  mockFeedback: vi.fn(),
  mockAwardMilestone: vi.fn(() => Promise.resolve('milestone-id')),
}))

vi.mock('../../lib/feedback', () => ({
  feedback: (...args) => mockFeedback(...args),
  prefersReducedMotion: () => false,
}))

vi.mock('../../lib/milestones', () => ({
  awardMilestone: (...args) => mockAwardMilestone(...args),
  MILESTONE_KIND: { WORD_MASTERED: 'word_mastered' },
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile.value }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'vocabulary_words') {
        return {
          select: () => Promise.resolve({ data: mockWords.value, error: null }),
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
    rpc: (...args) => mockRpc(...args),
  },
}))

// Fix Math.random for predictable card option order in tests
const realRandom = Math.random
beforeEach(() => {
  Math.random = () => 0.5
  mockProfile.value = { id: 's1', grade: '11' }
  mockWords.value = [
    {
      id: 'w1',
      word: 'Abandon',
      part_of_speech: 'verb',
      definition: 'To give up completely.',
      example_sentence: 'They had to abandon the building.',
      synonyms: ['forsake', 'desert', 'leave'],
      antonyms: ['keep', 'retain'],
      created_at: '2026-04-01T00:00:00Z',
    },
    {
      id: 'w2',
      word: 'Brisk',
      part_of_speech: 'adjective',
      definition: 'Quick and energetic.',
      example_sentence: 'A brisk walk.',
      synonyms: ['quick', 'lively'],
      antonyms: ['sluggish', 'slow'],
      created_at: '2026-04-02T00:00:00Z',
    },
    {
      id: 'w3',
      word: 'Candid',
      part_of_speech: 'adjective',
      definition: 'Truthful and frank.',
      example_sentence: 'A candid review.',
      synonyms: ['frank', 'honest'],
      antonyms: ['evasive', 'guarded'],
      created_at: '2026-04-03T00:00:00Z',
    },
  ]
  mockProgress.value = []
  mockRpc.mockClear()
  mockRpc.mockResolvedValue({ data: {}, error: null })
  mockNavigate.mockReset()
  mockFeedback.mockClear()
  mockAwardMilestone.mockClear()
  mockAwardMilestone.mockResolvedValue('milestone-id')
})

afterEach(() => {
  Math.random = realRandom
})

describe('VocabPractice', () => {
  it('does NOT redirect grade-10 students (ungated)', async () => {
    mockProfile.value = { id: 's1', grade: '10' }
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalledWith('/student/vocab', { replace: true })
  })

  it('does NOT redirect grade-9 students (ungated)', async () => {
    mockProfile.value = { id: 's1', grade: '9' }
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalledWith('/student/vocab', { replace: true })
  })

  it('does NOT redirect grade-11 students', async () => {
    mockProfile.value = { id: 's1', grade: '11' }
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalledWith('/student/vocab', { replace: true })
  })

  it('shows loading state initially', async () => {
    render(<VocabPractice />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no cards available', async () => {
    mockWords.value = []
    render(<VocabPractice />)
    await waitFor(() => {
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    })
  })

  it('renders the target word and prompt for first card', async () => {
    render(<VocabPractice />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument()
      expect(screen.getByText(/closest in meaning to "Abandon"/i)).toBeInTheDocument()
    })
  })

  it('renders 4 option buttons', async () => {
    render(<VocabPractice />)
    await waitFor(() => {
      const options = screen.getAllByTestId(/^option-/)
      expect(options).toHaveLength(4)
    })
  })

  it('shows definition and example sentence', async () => {
    render(<VocabPractice />)
    await waitFor(() => {
      expect(screen.getByText(/give up completely/i)).toBeInTheDocument()
      expect(screen.getByText(/abandon the building/i)).toBeInTheDocument()
    })
  })

  it('tapping the correct option calls grade_vocab_attempt with was_correct=true', async () => {
    const user = userEvent.setup()
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    const correctButton = screen.getByRole('button', { name: /^forsake$/i })
    await user.click(correctButton)
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('grade_vocab_attempt', { p_word_id: 'w1', p_was_correct: true })
    })
  })

  it('tapping a wrong option calls grade_vocab_attempt with was_correct=false', async () => {
    const user = userEvent.setup()
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    // Find a wrong option (any option whose label isn't a synonym of Abandon)
    const options = screen.getAllByTestId(/^option-/)
    const wrongOption = [...options].find(b => !['forsake', 'desert', 'leave'].includes(b.textContent.toLowerCase()))
    await user.click(wrongOption)
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('grade_vocab_attempt', { p_word_id: 'w1', p_was_correct: false })
    })
  })

  it('shows a Next button after answering', async () => {
    const user = userEvent.setup()
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getAllByTestId(/^option-/)[0])
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
    })
  })

  it('advances to the next card on Next', async () => {
    const user = userEvent.setup()
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getAllByTestId(/^option-/)[0])
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Brisk' })).toBeInTheDocument()
    })
  })

  it('fires feedback("correct") on correct answer', async () => {
    const user = userEvent.setup()
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    expect(mockFeedback).toHaveBeenCalledWith('correct')
  })

  it('fires feedback("wrong") on wrong answer', async () => {
    const user = userEvent.setup()
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    const options = screen.getAllByTestId(/^option-/)
    const wrongOption = [...options].find(b => !['forsake', 'desert', 'leave'].includes(b.textContent.toLowerCase()))
    await user.click(wrongOption)
    expect(mockFeedback).toHaveBeenCalledWith('wrong')
  })

  it('shows mastery confetti when a correct answer tips the word to box 5 with count >=3', async () => {
    const user = userEvent.setup()
    // Pre-state: box 4, correct_count 2, not mastered. Correct answer → box 5 + count 3 → mastery.
    mockProgress.value = [
      { word_id: 'w1', srs_box: 4, correct_count: 2, mastered_at: null, next_review_at: '2026-04-01T00:00:00Z' },
    ]
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    await waitFor(() => expect(screen.getByTestId('confetti')).toBeInTheDocument())
    expect(mockFeedback).toHaveBeenCalledWith('celebrate')
  })

  it('awards word_mastered milestone on the tipping-point correct answer', async () => {
    const user = userEvent.setup()
    mockProgress.value = [
      { word_id: 'w1', srs_box: 4, correct_count: 2, mastered_at: null, next_review_at: '2026-04-01T00:00:00Z' },
    ]
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    await waitFor(() => expect(mockAwardMilestone).toHaveBeenCalledWith('word_mastered', { word_id: 'w1' }))
  })

  it('does NOT award word_mastered on a non-tipping correct answer', async () => {
    const user = userEvent.setup()
    mockProgress.value = []
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    expect(mockAwardMilestone).not.toHaveBeenCalled()
  })

  it('does NOT show mastery confetti on a new word (no tipping point)', async () => {
    const user = userEvent.setup()
    mockProgress.value = []
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('does NOT show mastery confetti on a wrong answer (even at tipping point)', async () => {
    const user = userEvent.setup()
    mockProgress.value = [
      { word_id: 'w1', srs_box: 4, correct_count: 2, mastered_at: null, next_review_at: '2026-04-01T00:00:00Z' },
    ]
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    const options = screen.getAllByTestId(/^option-/)
    const wrongOption = [...options].find(b => !['forsake', 'desert', 'leave'].includes(b.textContent.toLowerCase()))
    await user.click(wrongOption)
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('does NOT show mastery confetti on a word already mastered', async () => {
    const user = userEvent.setup()
    mockProgress.value = [
      { word_id: 'w1', srs_box: 5, correct_count: 5, mastered_at: '2026-04-01T00:00:00Z', next_review_at: '2026-04-01T00:00:00Z' },
    ]
    // Already mastered word still in deck (maintenance check), but correct again should not re-fire confetti.
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^forsake$/i }))
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument()
  })

  it('shows session summary after the last card', async () => {
    const user = userEvent.setup()
    mockWords.value = mockWords.value.slice(0, 1) // one card only
    render(<VocabPractice />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abandon' })).toBeInTheDocument())
    const correctBtn = screen.getByRole('button', { name: /^forsake$/i })
    await user.click(correctBtn)
    await user.click(screen.getByRole('button', { name: /finish/i }))
    await waitFor(() => {
      expect(screen.getByText(/session complete/i)).toBeInTheDocument()
      // "1 of 1" — text is broken across spans, so match the surrounding context
      expect(screen.getByText(/^correct$/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    })
  })
})
