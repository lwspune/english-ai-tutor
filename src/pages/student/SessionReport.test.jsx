import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SessionReport from './SessionReport'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'session-1' }),
}))

const BASE_SESSION = {
  id: 'session-1',
  student_id: 'student-1',
  passage_id: 'passage-1',
  score_accuracy: 78,
  score_wpm: 145,
  score_phrasing: 65,
  score_comprehension: null,
  count_omissions: 3,
  count_substitutions: 2,
  word_results: [
    { word: 'Hello', status: 'correct' },
    { word: 'world', status: 'omission' },
  ],
  feedback: null,
  comprehension_answers: null,
  created_at: new Date(2026, 3, 15).toISOString(),
  passages: { title: 'Test Passage', content: 'Hello world.' },
}

const QUESTION = {
  id: 'q1',
  passage_id: 'passage-1',
  question_text: 'What is the main idea?',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  correct_index: 0,
  display_order: 1,
}

const { sessionRef, prevSessionsRef, questionsRef } = vi.hoisted(() => ({
  sessionRef: { data: null },
  prevSessionsRef: { data: [] },
  questionsRef: { data: [] },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'sessions') {
        return {
          select: (fields) => {
            if (fields && fields.includes('passages')) {
              return { eq: () => ({ single: () => Promise.resolve({ data: sessionRef.data }) }) }
            }
            return {
              eq: () => ({
                eq: () => ({
                  neq: () => Promise.resolve({ data: prevSessionsRef.data }),
                }),
              }),
            }
          },
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { grade: 10 } }) }) }),
        }
      }
      if (table === 'questions') {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: questionsRef.data }) }) }),
        }
      }
      return {}
    },
  },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  sessionRef.data = { ...BASE_SESSION }
  prevSessionsRef.data = []
  questionsRef.data = []
})

// ─── Scores ───────────────────────────────────────────────────────────────────

describe('SessionReport — scores', () => {
  it('shows accuracy score', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('78%'))
  })

  it('shows passage title', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
  })

  it('shows WPM score', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('145'))
  })

  it('shows phrasing score', async () => {
    render(<SessionReport />)
    await waitFor(() => screen.getByText('65%'))
  })

  it('shows comprehension score when present', async () => {
    sessionRef.data = { ...BASE_SESSION, score_comprehension: 75 }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('75%'))
  })
})

// ─── Personal best ────────────────────────────────────────────────────────────

describe('SessionReport — personal best', () => {
  it('shows personal best banner when accuracy is a new record', async () => {
    prevSessionsRef.data = [{ score_accuracy: 70, score_wpm: 130 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/new personal best/i))
  })

  it('does not show personal best banner on the first attempt', async () => {
    prevSessionsRef.data = []
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(screen.queryByText(/new personal best/i)).not.toBeInTheDocument()
  })

  it('shows previous best when no new record', async () => {
    prevSessionsRef.data = [{ score_accuracy: 85, score_wpm: 155 }]
    render(<SessionReport />)
    await waitFor(() => screen.getByText(/best/i))
    expect(screen.getByText(/85%/)).toBeInTheDocument()
  })
})

// ─── Comprehension ────────────────────────────────────────────────────────────

describe('SessionReport — comprehension', () => {
  it('shows comprehension CTA when questions exist and not yet answered', async () => {
    questionsRef.data = [QUESTION]
    render(<SessionReport />)
    await waitFor(() => screen.getByRole('button', { name: /comprehension/i }))
  })

  it('does not show comprehension CTA when already answered', async () => {
    questionsRef.data = [QUESTION]
    sessionRef.data = {
      ...BASE_SESSION,
      comprehension_answers: [{ question_id: 'q1', selected_index: 0, is_correct: true }],
      score_comprehension: 100,
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Test Passage'))
    expect(screen.queryByRole('button', { name: /comprehension/i })).not.toBeInTheDocument()
  })

  it('shows comprehension results when already answered', async () => {
    questionsRef.data = [QUESTION]
    sessionRef.data = {
      ...BASE_SESSION,
      comprehension_answers: [{ question_id: 'q1', selected_index: 0, is_correct: true }],
      score_comprehension: 100,
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('What is the main idea?'))
  })
})

// ─── AI feedback ──────────────────────────────────────────────────────────────

describe('SessionReport — feedback', () => {
  it('shows wentWell and focusOn from AI feedback', async () => {
    sessionRef.data = {
      ...BASE_SESSION,
      feedback: JSON.stringify({
        wentWell: 'Good pacing throughout.',
        focusOn: 'Work on pausing at commas.',
        practiseWords: ['therefore'],
        tip: 'Take a breath at punctuation marks.',
      }),
    }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Good pacing throughout.'))
    expect(screen.getByText('Work on pausing at commas.')).toBeInTheDocument()
  })

  it('shows plain text feedback when not JSON', async () => {
    sessionRef.data = { ...BASE_SESSION, feedback: 'Keep practising your phrasing.' }
    render(<SessionReport />)
    await waitFor(() => screen.getByText('Keep practising your phrasing.'))
  })
})
