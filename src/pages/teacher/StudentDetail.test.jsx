import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentDetail from './StudentDetail'

const mockNavigate = vi.fn()
const mockInvoke = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ studentId: 'student-1' }),
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'teacher-1' } }),
}))

vi.mock('../../components/PerformanceCharts', () => ({
  MetricCard: () => null,
}))

const AI_FEEDBACK = JSON.stringify({
  wentWell: 'Great accuracy on most words.',
  focusOn: 'Work on your pace.',
  tip: 'Read aloud daily.',
  practiseWords: ['therefore', 'consequently'],
})

const RULE_FEEDBACK = 'You substituted 3 words. Focus on reading each word carefully.'

// Vocab + drill fixtures (Phase 1 — teacher visibility into student vocab and drills)
const STUDENT_VOCAB_PROGRESS = [
  // 2 mastered (1 via practice, 1 via reading-encounter)
  { word_id: 'w-1', srs_box: 5, correct_count: 4, mastered_at: '2026-04-15T00:00:00Z', next_review_at: '2026-05-15T00:00:00Z', total_encounters: 8, last_encounter_source: 'practice' },
  { word_id: 'w-2', srs_box: 5, correct_count: 3, mastered_at: '2026-04-20T00:00:00Z', next_review_at: '2026-05-20T00:00:00Z', total_encounters: 6, last_encounter_source: 'reading' },
  // 2 in-progress (1 due now — next_review_at in past; 1 future)
  { word_id: 'w-3', srs_box: 2, correct_count: 1, mastered_at: null, next_review_at: '2026-04-01T00:00:00Z', total_encounters: 3, last_encounter_source: 'practice' },
  { word_id: 'w-4', srs_box: 3, correct_count: 2, mastered_at: null, next_review_at: '2030-06-01T00:00:00Z', total_encounters: 4, last_encounter_source: 'reading' },
]
const TOTAL_VOCAB_WORDS = 100

const STUDENT_DRILL_ATTEMPTS = [
  { id: 'd-1', stumble_word: 'therefore', sentence: 'Therefore we must act.', score: 100, was_correct: true, attempt_index: 1, created_at: '2026-04-25T10:00:00Z' },
  { id: 'd-2', stumble_word: 'consequently', sentence: 'Consequently they failed.', score: 0, was_correct: false, attempt_index: 1, created_at: '2026-04-26T10:00:00Z' },
  { id: 'd-3', stumble_word: 'therefore', sentence: 'Therefore we must act.', score: 100, was_correct: true, attempt_index: 2, created_at: '2026-04-27T10:00:00Z' },
]

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { id: 'student-1', full_name: 'Aarav Shah', grade: '12' } }),
            }),
          }),
        }
      }
      if (table === 'student_word_progress') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: STUDENT_VOCAB_PROGRESS, error: null }),
          }),
        }
      }
      if (table === 'vocabulary_words') {
        return {
          select: () => Promise.resolve({ count: TOTAL_VOCAB_WORDS, error: null, data: null }),
        }
      }
      if (table === 'drill_attempts') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: STUDENT_DRILL_ATTEMPTS, error: null }),
            }),
          }),
        }
      }
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [
                  {
                    id: 'sess-1', created_at: '2026-04-01T10:00:00Z',
                    score_accuracy: 85, score_wpm: 120, score_phrasing: 70, score_fluency: 70,
                    count_omissions: 2, count_substitutions: 3,
                    score_comprehension: null, comprehension_answers: null,
                    word_results: [], feedback: AI_FEEDBACK,
                    passages: { title: 'The Gift of the Magi' },
                    // cost: 60s Whisper ($0.006) + 500 input + 150 output = $0.006165
                    whisper_duration_seconds: 60, llm_input_tokens: 500, llm_output_tokens: 150,
                  },
                  {
                    id: 'sess-2', created_at: '2026-04-02T10:00:00Z',
                    score_accuracy: 90, score_wpm: 140, score_phrasing: 80, score_fluency: 80,
                    count_omissions: 1, count_substitutions: 1,
                    score_comprehension: null, comprehension_answers: null,
                    word_results: [], feedback: RULE_FEEDBACK,
                    passages: { title: 'The Gift of the Magi' },
                    // old session — no cost data
                    whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null,
                  },
                  {
                    // Low-score session — drives down the "other" mean so sess-4 trips outlier
                    id: 'sess-3', created_at: '2026-04-03T10:00:00Z',
                    score_accuracy: 50, score_wpm: 80, score_phrasing: 40, score_fluency: 40,
                    count_omissions: 15, count_substitutions: 10,
                    score_comprehension: null, comprehension_answers: null,
                    word_results: [], feedback: null,
                    passages: { title: 'A Difficult Read' },
                    whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null,
                  },
                  {
                    // The outlier: acc=100, others mean (85+90+50)/3 = 75, gap = 25 → flagged
                    id: 'sess-4', created_at: '2026-04-04T10:00:00Z',
                    score_accuracy: 100, score_wpm: 150, score_phrasing: 100, score_fluency: 100,
                    count_omissions: 0, count_substitutions: 0,
                    score_comprehension: null, comprehension_answers: null,
                    word_results: [], feedback: null,
                    passages: { title: 'Suspiciously Perfect' },
                    whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null,
                  },
                ],
              }),
            }),
          }),
          rpc: () => Promise.resolve({}),
        }
      }
      return {}
    },
    rpc: () => Promise.resolve({}),
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
  },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  mockInvoke.mockReset()
})

// ─── Feedback panel ───────────────────────────────────────────────────────────

describe('StudentDetail — feedback panel', () => {
  it('shows a Feedback button for each session', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))
    const buttons = screen.getAllByRole('button', { name: /feedback/i })
    expect(buttons).toHaveLength(2)
  })

  it('expands AI feedback when the button is clicked', async () => {
    const user = userEvent.setup()
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))

    const [firstBtn] = screen.getAllByRole('button', { name: /feedback/i })
    await user.click(firstBtn)

    expect(screen.getByText('Great accuracy on most words.')).toBeInTheDocument()
    expect(screen.getByText('Work on your pace.')).toBeInTheDocument()
    expect(screen.getByText('Read aloud daily.')).toBeInTheDocument()
  })

  it('expands plain-text feedback when the button is clicked', async () => {
    const user = userEvent.setup()
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))

    const buttons = screen.getAllByRole('button', { name: /feedback/i })
    await user.click(buttons[1])

    expect(screen.getByText(RULE_FEEDBACK)).toBeInTheDocument()
  })

  it('collapses feedback when the button is clicked again', async () => {
    const user = userEvent.setup()
    render(<StudentDetail />)
    await waitFor(() => screen.getAllByText('The Gift of the Magi'))

    const [firstBtn] = screen.getAllByRole('button', { name: /feedback/i })
    await user.click(firstBtn)
    expect(screen.getByText('Great accuracy on most words.')).toBeInTheDocument()

    await user.click(firstBtn)
    expect(screen.queryByText('Great accuracy on most words.')).not.toBeInTheDocument()
  })
})

// ─── Reset Password ───────────────────────────────────────────────────────────

describe('StudentDetail — reset password', () => {
  async function waitForLoad() {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText('Aarav Shah'))
  }

  it('shows a Reset Password button in the header', async () => {
    await waitForLoad()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('opens a password modal when Reset Password is clicked', async () => {
    const user = userEvent.setup()
    await waitForLoad()

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  })

  it('calls reset-student-password edge function with correct payload', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null })
    const user = userEvent.setup()
    await waitForLoad()

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await user.type(screen.getByLabelText(/new password/i), 'newpassword1')
    await user.click(screen.getByRole('button', { name: /^confirm/i }))

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('reset-student-password', {
        body: { student_id: 'student-1', new_password: 'newpassword1' },
      })
    )
  })

  it('shows success banner after password reset', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null })
    const user = userEvent.setup()
    await waitForLoad()

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await user.type(screen.getByLabelText(/new password/i), 'newpassword1')
    await user.click(screen.getByRole('button', { name: /^confirm/i }))

    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument())
  })

  it('surfaces the actual function error from the response body, not the generic FunctionsHttpError message', async () => {
    // Real Supabase FunctionsHttpError shape: .message is a generic
    // "Edge function returned a non-2xx status code" string; the actual
    // error text lives in .context.json().error. The handler should read
    // the body via extractEdgeFunctionError, not just .message.
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge function returned a non-2xx status code',
        context: { json: async () => ({ error: 'Student not found' }) },
      },
    })
    const user = userEvent.setup()
    await waitForLoad()

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await user.type(screen.getByLabelText(/new password/i), 'newpassword1')
    await user.click(screen.getByRole('button', { name: /^confirm/i }))

    await waitFor(() => expect(screen.getByText(/student not found/i)).toBeInTheDocument())
    // The generic Supabase wrapper text must NOT be what the teacher sees.
    expect(screen.queryByText(/non-2xx/i)).not.toBeInTheDocument()
  })

  it('falls back to "Reset failed" when neither fnError nor data.error has usable text', async () => {
    // Defensive case: pathological response where everything is missing.
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: '', context: { json: async () => ({}) } },
    })
    const user = userEvent.setup()
    await waitForLoad()

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await user.type(screen.getByLabelText(/new password/i), 'newpassword1')
    await user.click(screen.getByRole('button', { name: /^confirm/i }))

    await waitFor(() => expect(screen.getByText(/reset failed/i)).toBeInTheDocument())
  })

  it('closes the modal when Cancel is clicked', async () => {
    const user = userEvent.setup()
    await waitForLoad()

    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })
})

// ─── Cost column ──────────────────────────────────────────────────────────────

// ─── Vocab progress (Phase 1 teacher visibility) ──────────────────────────────

describe('StudentDetail — vocab progress', () => {
  it('renders the Vocab Progress section with the section heading', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText(/vocab progress/i))
    expect(screen.getByText(/vocab progress/i)).toBeInTheDocument()
  })

  it('shows mastered count and total NDA-list words', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByTestId('vocab-stat-mastered'))
    // 2 of the 4 progress rows have mastered_at set
    expect(screen.getByTestId('vocab-stat-mastered')).toHaveTextContent('2')
    // Total NDA-list words from the mock = 100
    expect(screen.getByText(/of 100/i)).toBeInTheDocument()
  })

  it('shows in-progress count (mastered_at IS NULL)', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByTestId('vocab-stat-in-progress'))
    // 2 unmastered (w-3, w-4)
    expect(screen.getByTestId('vocab-stat-in-progress')).toHaveTextContent('2')
  })

  it('shows due-now count (unmastered AND next_review_at <= now)', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByTestId('vocab-stat-due-now'))
    // Only w-3 has next_review_at in the past
    expect(screen.getByTestId('vocab-stat-due-now')).toHaveTextContent('1')
  })

  it('shows from-reading count (last_encounter_source = reading)', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByTestId('vocab-stat-from-reading'))
    // w-2 (mastered via reading) + w-4 (in-progress via reading) = 2
    expect(screen.getByTestId('vocab-stat-from-reading')).toHaveTextContent('2')
  })
})

// ─── Drill activity (Phase 1 teacher visibility) ──────────────────────────────

describe('StudentDetail — drill activity', () => {
  it('renders the Drill Activity section heading', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText(/drill activity/i))
    expect(screen.getByText(/drill activity/i)).toBeInTheDocument()
  })

  it('shows total attempts, distinct stumble words, and correct-rate stats', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByTestId('drill-stat-attempts'))
    // 3 attempts total
    expect(screen.getByTestId('drill-stat-attempts')).toHaveTextContent('3')
    // 2 distinct stumble words (therefore, consequently)
    expect(screen.getByTestId('drill-stat-distinct-words')).toHaveTextContent('2')
    // 2 of 3 correct = 67%
    expect(screen.getByTestId('drill-stat-correct-rate')).toHaveTextContent('67%')
  })

  it('lists recent drill attempts with word + result', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText(/drill activity/i))
    // Words rendered in the attempt list
    expect(screen.getAllByText('therefore').length).toBeGreaterThan(0)
    expect(screen.getByText('consequently')).toBeInTheDocument()
  })
})

// ─── Outlier flag ─────────────────────────────────────────────────────────────

describe('StudentDetail — outlier flag', () => {
  it('renders the "Outlier — review" chip on the outlier session row only', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText('Suspiciously Perfect'))

    const chips = screen.getAllByText(/outlier — review/i)
    expect(chips).toHaveLength(1)
    expect(screen.getByTestId('outlier-flag-sess-4')).toBeInTheDocument()
    expect(screen.queryByTestId('outlier-flag-sess-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('outlier-flag-sess-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('outlier-flag-sess-3')).not.toBeInTheDocument()
  })

  it('chip tooltip explains the gap to the student\'s other sessions', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText('Suspiciously Perfect'))

    const chip = screen.getByTestId('outlier-flag-sess-4')
    // Tooltip is on the `title` attribute — assert against that.
    expect(chip.getAttribute('title')).toMatch(/100%/)
    expect(chip.getAttribute('title')).toMatch(/25pts/)
    expect(chip.getAttribute('title')).toMatch(/avg 75%/)
  })
})

// ─── Cost column ──────────────────────────────────────────────────────────────

describe('StudentDetail — cost column', () => {
  it('renders a Cost column header in the session table', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    expect(screen.getByRole('columnheader', { name: /cost/i })).toBeInTheDocument()
  })

  it('shows formatted cost for a session with metrics', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    // sess-1: 60s Whisper ($0.006) + 500 input + 150 output = $0.006165 → $0.0062
    expect(screen.getByText('$0.0062')).toBeInTheDocument()
  })

  it('shows "—" for an old session without cost metrics', async () => {
    render(<StudentDetail />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    // sess-2 has all nulls
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })
})
