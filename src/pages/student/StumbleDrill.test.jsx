import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import StumbleDrill from './StumbleDrill'

const SESSION = {
  id: 'session-1',
  student_id: 'student-1',
  created_at: '2026-05-12T06:30:00.000Z',
  passages: {
    title: 'AI in Everyday Life',
    content:
      'Artificial intelligence is everywhere. In finance, algorithms detect fraudulent transactions. ' +
      'AI systems trained on biased data can amplify discrimination.',
  },
}

// Supabase returns desc by created_at; the page reverses to asc (latest LAST).
const RECENT = [
  {
    id: 'session-1',
    created_at: '2026-05-12T06:30:00.000Z',
    word_results: [
      { word: 'fraudulent', status: 'substitution' },
      { word: 'discriminate', status: 'omission' },
      { word: 'amplify', status: 'substitution' },
    ],
  },
  {
    id: 'session-0',
    created_at: '2026-05-11T06:30:00.000Z',
    word_results: [{ word: 'fraudulent', status: 'substitution' }],
  },
]

const { recorderState, mockNavigate, sessionRef, recentRef, attemptsRef, uploadCalls, invokeMock, mockFeedback } = vi.hoisted(() => ({
  recorderState: {
    value: {
      recording: false,
      audioBlob: null,
      remaining: 60,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      reset: vi.fn(),
    },
  },
  mockNavigate: vi.fn(),
  sessionRef: { data: null },
  recentRef: { data: [] },
  attemptsRef: { data: [] },
  uploadCalls: { value: [] },
  invokeMock: vi.fn(),
  mockFeedback: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'session-1', wordIndex: '0' }),
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
}))

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => recorderState.value,
}))

vi.mock('../../components/AudioPlayButton', () => ({
  default: ({ word }) => <button aria-label={`Play ${word}`}>▶</button>,
}))

vi.mock('../../components/Confetti', () => ({
  default: ({ active }) => (active ? <div data-testid="confetti" /> : null),
}))

vi.mock('../../lib/feedback', () => ({
  feedback: (...args) => mockFeedback(...args),
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
                lte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: recentRef.data }),
                  }),
                }),
              }),
            }
          },
        }
      }
      if (table === 'drill_attempts') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                order: () => Promise.resolve({ data: attemptsRef.data }),
              }),
            }),
          }),
        }
      }
      return {}
    },
    storage: {
      from: () => ({
        upload: async (path, blob) => {
          uploadCalls.value.push({ path, blob })
          return { error: null }
        },
      }),
    },
    functions: {
      invoke: (...args) => invokeMock(...args),
    },
  },
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'student-1', grade: '12' } }),
}))

function setRecorder(overrides) {
  recorderState.value = {
    recording: false,
    audioBlob: null,
    remaining: 60,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  sessionRef.data = SESSION
  recentRef.data = RECENT
  attemptsRef.data = []
  uploadCalls.value = []
  invokeMock.mockReset()
  mockNavigate.mockReset()
  mockFeedback.mockReset()
  setRecorder({})
})

describe('StumbleDrill', () => {
  it('renders the stumble word and its sentence from the passage', async () => {
    render(<StumbleDrill />)
    expect(
      await screen.findByRole('heading', { level: 2, name: /fraudulent/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/in finance, algorithms detect fraudulent transactions/i),
    ).toBeInTheDocument()
  })

  it('redirects to the report when wordIndex is out of bounds', async () => {
    recentRef.data = [{ id: 'session-1', word_results: [{ word: 'hello', status: 'correct' }] }]
    render(<StumbleDrill />)
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/student/report/session-1', { replace: true }),
    )
  })

  it('shows ✓ result and Done button after a correct submission', async () => {
    invokeMock.mockResolvedValue({
      data: { wasCorrect: true, attemptIndex: 1, score: 100 },
      error: null,
    })
    setRecorder({ audioBlob: new Blob(['x'], { type: 'audio/webm' }) })
    render(<StumbleDrill />)
    await screen.findByRole('heading', { level: 2, name: /fraudulent/i })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => screen.getByText(/got it/i))
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith(
      'analyze-drill',
      expect.objectContaining({
        body: expect.objectContaining({
          sessionId: 'session-1',
          stumbleWord: 'fraudulent',
        }),
      }),
    )
  })

  it('shows ✗ result + try-again option on wrong submission with attempts remaining', async () => {
    invokeMock.mockResolvedValue({
      data: { wasCorrect: false, attemptIndex: 1, score: 0 },
      error: null,
    })
    setRecorder({ audioBlob: new Blob(['x'], { type: 'audio/webm' }) })
    render(<StumbleDrill />)
    await screen.findByRole('heading', { level: 2, name: /fraudulent/i })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await screen.findByRole('button', { name: /try again/i })
    expect(screen.getByText(/2 attempts left/i)).toBeInTheDocument()
  })

  it('disables further attempts when 3 attempts have been used', async () => {
    attemptsRef.data = [
      { id: 'a1', attempt_index: 1, was_correct: false, score: 0 },
      { id: 'a2', attempt_index: 2, was_correct: false, score: 0 },
      { id: 'a3', attempt_index: 3, was_correct: false, score: 0 },
    ]
    render(<StumbleDrill />)
    await screen.findByRole('heading', { level: 2, name: /fraudulent/i })
    expect(screen.queryByRole('button', { name: /record/i })).not.toBeInTheDocument()
    expect(screen.getByText(/no attempts left/i)).toBeInTheDocument()
  })

  it('fires feedback("correct") on successful submission', async () => {
    invokeMock.mockResolvedValue({
      data: { wasCorrect: true, attemptIndex: 1, score: 100 },
      error: null,
    })
    setRecorder({ audioBlob: new Blob(['x'], { type: 'audio/webm' }) })
    render(<StumbleDrill />)
    await screen.findByRole('heading', { level: 2, name: /fraudulent/i })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => screen.getByText(/got it/i))
    expect(mockFeedback).toHaveBeenCalledWith('correct')
  })
})
