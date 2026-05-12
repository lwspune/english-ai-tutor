import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ReadingSession from './ReadingSession'

const { mockFeedback } = vi.hoisted(() => ({ mockFeedback: vi.fn() }))
vi.mock('../../lib/feedback', () => ({
  feedback: (...args) => mockFeedback(...args),
  prefersReducedMotion: () => false,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ passageId: 'passage-1' }),
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'student-1', grade: 10 } }),
}))

const { mockRecorderState } = vi.hoisted(() => ({
  mockRecorderState: { recording: false, audioBlob: null, autoStopped: false, remaining: 180 },
}))

vi.mock('../../hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    ...mockRecorderState,
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

const { mockCounts, mockInvoke, mockUpload } = vi.hoisted(() => ({
  mockCounts: { attempt: 0, today: 0, dailyLimit: 5 },
  mockInvoke: vi.fn(),
  mockUpload: vi.fn(),
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
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ count: mockCounts.attempt }),
              gte: () => Promise.resolve({ count: mockCounts.today }),
            }),
          }),
        }
      }
      return {}
    },
    storage: { from: () => ({ upload: (...args) => mockUpload(...args) }) },
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  mockCounts.attempt = 0
  mockCounts.today = 0
  mockCounts.dailyLimit = 5
  mockRecorderState.recording = false
  mockRecorderState.audioBlob = null
  mockRecorderState.autoStopped = false
  mockRecorderState.remaining = 180
  mockFeedback.mockClear()
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue({ data: { sessionId: 'new-session-id' }, error: null })
  mockUpload.mockReset()
  mockUpload.mockResolvedValue({ data: { path: 'student-1/abc.webm' }, error: null })
})

// ─── Daily limit ──────────────────────────────────────────────────────────────

describe('ReadingSession — daily limit', () => {
  it('enables Start Recording when under daily limit', async () => {
    mockCounts.today = 2
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start recording/i })).not.toBeDisabled()
    })
  })

  it('disables Start Recording when daily limit is reached', async () => {
    mockCounts.today = 5
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start recording/i })).toBeDisabled()
    })
  })

  it('shows daily limit message when limit is reached', async () => {
    mockCounts.today = 5
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.getByText(/today's limit of 5 passages/i)).toBeInTheDocument()
    })
  })

  it('does not show daily limit message when under limit', async () => {
    mockCounts.today = 3
    render(<ReadingSession />)
    await waitFor(() => {
      expect(screen.queryByText(/today's limit/i)).not.toBeInTheDocument()
    })
  })
})

// ─── Recording indicator ──────────────────────────────────────────────────────

describe('ReadingSession — recording indicator', () => {
  it('shows a pulsing recording indicator when recording', async () => {
    mockRecorderState.recording = true
    render(<ReadingSession />)
    await waitFor(() => screen.getByTestId('recording-pulse'))
  })

  it('shows timer countdown when recording', async () => {
    mockRecorderState.recording = true
    mockRecorderState.remaining = 180
    render(<ReadingSession />)
    await waitFor(() => screen.getByText('3:00'))
  })

  it('shows timer in red when 30 seconds or fewer remain', async () => {
    mockRecorderState.recording = true
    mockRecorderState.remaining = 25
    render(<ReadingSession />)
    await waitFor(() => screen.getByText('0:25'))
    expect(screen.getByText('0:25').className).toMatch(/red/)
  })

  it('does not show recording indicator when not recording', async () => {
    render(<ReadingSession />)
    await waitFor(() => screen.getByRole('button', { name: /start recording/i }))
    expect(screen.queryByTestId('recording-pulse')).not.toBeInTheDocument()
  })

  it('fires feedback("tap") when Start Recording is clicked', async () => {
    render(<ReadingSession />)
    await waitFor(() => screen.getByRole('button', { name: /start recording/i }))
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    expect(mockFeedback).toHaveBeenCalledWith('tap')
  })

  it('fires feedback("tap") when Stop Recording is clicked', async () => {
    mockRecorderState.recording = true
    render(<ReadingSession />)
    await waitFor(() => screen.getByRole('button', { name: /stop recording/i }))
    fireEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    expect(mockFeedback).toHaveBeenCalledWith('tap')
  })
})

// ─── Identity hardening (Finding 3) ───────────────────────────────────────────

describe('ReadingSession — invoke body shape (Finding 3)', () => {
  it('does NOT include studentId / passageText / grade — those are derived server-side from the JWT', async () => {
    mockRecorderState.audioBlob = new Blob(['fake audio'], { type: 'audio/webm' })
    render(<ReadingSession />)
    await waitFor(() => screen.getByRole('button', { name: /submit/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    const [fnName, opts] = mockInvoke.mock.calls[0]
    expect(fnName).toBe('analyze-reading')
    expect(opts.body).not.toHaveProperty('studentId')
    expect(opts.body).not.toHaveProperty('passageText')
    expect(opts.body).not.toHaveProperty('grade')
    expect(opts.body).toHaveProperty('audioPath')
    expect(opts.body).toHaveProperty('passageId')
    expect(opts.body).toHaveProperty('aiFeedbackEnabled')
  })
})
