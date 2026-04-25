import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ReadingSession from './ReadingSession'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ passageId: 'passage-1' }),
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'student-1', grade: 10 } }),
}))

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    recording: false,
    audioBlob: null,
    autoStopped: false,
    remaining: 180,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    reset: vi.fn(),
  }),
}))

const PASSAGE = {
  id: 'passage-1',
  title: 'Test Passage',
  content: 'Hello world.',
  word_count: 2,
  grade_level: 10,
}

const { mockCounts } = vi.hoisted(() => ({
  mockCounts: { attempt: 0, today: 0, dailyLimit: 5 },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'passages') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: PASSAGE }) }) }),
        }
      }
      if (table === 'app_settings') {
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { ai_feedback_enabled: true, daily_session_limit: mockCounts.dailyLimit },
              }),
          }),
        }
      }
      if (table === 'sessions') {
        return {
          // select is called with count options; first .eq is always student_id
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ count: mockCounts.attempt }), // per-passage attempts
              gte: () => Promise.resolve({ count: mockCounts.today }),  // today's sessions
            }),
          }),
        }
      }
      return {}
    },
    storage: { from: () => ({ upload: vi.fn() }) },
    functions: { invoke: vi.fn() },
  },
}))

describe('ReadingSession — daily limit', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockCounts.attempt = 0
    mockCounts.today = 0
    mockCounts.dailyLimit = 5
  })

  it('enables Start Recording when under daily limit', async () => {
    mockCounts.today = 2
    mockCounts.dailyLimit = 5
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start recording/i })).not.toBeDisabled()
    })
  })

  it('disables Start Recording when daily limit is reached', async () => {
    mockCounts.today = 5
    mockCounts.dailyLimit = 5
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start recording/i })).toBeDisabled()
    })
  })

  it('shows daily limit message when limit is reached', async () => {
    mockCounts.today = 5
    mockCounts.dailyLimit = 5
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.getByText(/today's limit of 5 passages/i)).toBeInTheDocument()
    })
  })

  it('does not show daily limit message when under limit', async () => {
    mockCounts.today = 3
    mockCounts.dailyLimit = 5
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.queryByText(/today's limit/i)).not.toBeInTheDocument()
    })
  })
})
