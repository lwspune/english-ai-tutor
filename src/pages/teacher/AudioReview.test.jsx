import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AudioReview from './AudioReview'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 't1', role: 'teacher', full_name: 'Test Teacher' } }),
}))

const { mockSessions, invokeMock, rpcMock } = vi.hoisted(() => ({
  mockSessions: { value: [] },
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'sessions') {
        return {
          select: () => ({
            not: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: mockSessions.value, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
    functions: { invoke: (...args) => invokeMock(...args) },
    rpc: (...args) => rpcMock(...args),
  },
}))

let lastAudio
const originalAudio = globalThis.Audio

beforeEach(() => {
  mockNavigate.mockReset()
  invokeMock.mockReset()
  invokeMock.mockResolvedValue({ data: { url: 'https://example.com/signed.webm' }, error: null })
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: null, error: null })
  mockSessions.value = []

  lastAudio = null
  function MockAudio(src) {
    this.src = src
    this.play = vi.fn(() => Promise.resolve())
    this.pause = vi.fn()
    this.addEventListener = vi.fn((event, cb) => {
      if (event === 'ended') this._onEnded = cb
    })
    this.removeEventListener = vi.fn()
    lastAudio = this
  }
  globalThis.Audio = MockAudio
})

afterEach(() => {
  globalThis.Audio = originalAudio
})

function session(overrides = {}) {
  return {
    id: 'sess-1',
    created_at: '2026-05-12T10:00:00Z',
    score_accuracy: 88,
    score_wpm: 145,
    score_phrasing: 80,
    score_comprehension: 75,
    retained_audio_path: 'student-1/abc.webm',
    retention_reviewed_status: null,
    profiles: { full_name: 'Shreya Kharat' },
    passages: { title: 'Importance of Trees' },
    ...overrides,
  }
}

describe('AudioReview', () => {
  it('renders the page header', async () => {
    render(<AudioReview />)
    await screen.findByRole('heading', { name: /audio review/i })
  })

  it('renders one row per retained session', async () => {
    mockSessions.value = [
      session({ id: 's1', profiles: { full_name: 'Alice' }, passages: { title: 'Trees' } }),
      session({ id: 's2', profiles: { full_name: 'Bob' }, passages: { title: 'Discipline' } }),
    ]
    render(<AudioReview />)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('shows an empty-state message when no retained sessions', async () => {
    mockSessions.value = []
    render(<AudioReview />)
    await screen.findByText(/no retained recordings/i)
  })

  it('clicking Play invokes retained-audio-url with the session id', async () => {
    mockSessions.value = [session({ id: 's-play' })]
    render(<AudioReview />)
    const playBtn = await screen.findByRole('button', { name: /play/i })
    fireEvent.click(playBtn)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())
    const [fnName, opts] = invokeMock.mock.calls[0]
    expect(fnName).toBe('retained-audio-url')
    expect(opts.body).toEqual({ sessionId: 's-play' })
  })

  it('clicking "Reviewed" calls mark_retention_review with status "reviewed"', async () => {
    mockSessions.value = [session({ id: 's-mark' })]
    render(<AudioReview />)
    const btn = await screen.findByRole('button', { name: /^reviewed$/i })
    fireEvent.click(btn)
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('mark_retention_review', {
      p_session_id: 's-mark',
      p_status: 'reviewed',
    })
  })

  it('clicking "Disputed" calls mark_retention_review with status "disputed"', async () => {
    mockSessions.value = [session({ id: 's-d' })]
    render(<AudioReview />)
    const btn = await screen.findByRole('button', { name: /^disputed$/i })
    fireEvent.click(btn)
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('mark_retention_review', {
      p_session_id: 's-d',
      p_status: 'disputed',
    })
  })

  it('clicking "No action" calls mark_retention_review with status "no_action"', async () => {
    mockSessions.value = [session({ id: 's-na' })]
    render(<AudioReview />)
    const btn = await screen.findByRole('button', { name: /no action/i })
    fireEvent.click(btn)
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('mark_retention_review', {
      p_session_id: 's-na',
      p_status: 'no_action',
    })
  })

  it('renders a status badge for already-reviewed sessions', async () => {
    mockSessions.value = [session({ id: 's-1', retention_reviewed_status: 'reviewed' })]
    render(<AudioReview />)
    await screen.findByTestId('status-badge-s-1')
    expect(screen.getByTestId('status-badge-s-1')).toHaveTextContent(/reviewed/i)
  })

  it('Back button navigates to teacher dashboard', async () => {
    render(<AudioReview />)
    const back = await screen.findByRole('button', { name: /back/i })
    fireEvent.click(back)
    expect(mockNavigate).toHaveBeenCalledWith('/teacher')
  })
})
