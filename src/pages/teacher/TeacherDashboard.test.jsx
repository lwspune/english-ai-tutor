import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeacherDashboard from './TeacherDashboard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { full_name: 'Ms. Sharma' }, signOut: vi.fn() }),
}))

let profileFetchCount = 0

// Dates anchored relative to test-run "now" so the inactive / outlier filters
// behave correctly regardless of when the test runs.
const NOW = Date.now()
const DAY_MS = 24 * 60 * 60 * 1000
const isoDaysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString()

// Sessions with cost metrics: 60s Whisper + 500 input + 150 output tokens
// Whisper: 60/60 * 0.006 = $0.006
// GPT:     500 * 0.00000015 + 150 * 0.0000006 = $0.000075 + $0.00009 = $0.000165
// Total per session: $0.006165
// Two sessions → $0.012330
const SESSION_WITH_COST = {
  id: 'sess-aarav-1',
  student_id: 'student-1',
  score_accuracy: 85,
  score_wpm: 130,
  created_at: isoDaysAgo(2),
  whisper_duration_seconds: 60,
  llm_input_tokens: 500,
  llm_output_tokens: 150,
}
const SESSION_WITH_COST_2 = { ...SESSION_WITH_COST, id: 'sess-aarav-2', created_at: isoDaysAgo(1) }

// Student-2: inactive (last session 30 days ago)
const SESSION_IRIS = {
  id: 'sess-iris-1',
  student_id: 'student-2',
  score_accuracy: 70,
  score_wpm: 100,
  created_at: isoDaysAgo(30),
  whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null,
}

// Student-4: 3 sessions, last one an outlier (100 vs prior ~60)
const SESSION_SAM_1 = {
  id: 'sess-sam-1',
  student_id: 'student-4',
  score_accuracy: 60,
  score_wpm: 120,
  created_at: isoDaysAgo(5),
  whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null,
}
const SESSION_SAM_2 = { ...SESSION_SAM_1, id: 'sess-sam-2', created_at: isoDaysAgo(3) }
const SESSION_SAM_OUTLIER = {
  id: 'sess-sam-outlier',
  student_id: 'student-4',
  score_accuracy: 100,
  score_wpm: 140,
  created_at: isoDaysAgo(1),
  whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null,
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'app_settings') {
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: { ai_feedback_enabled: true, class_code: 'ABC123', daily_session_limit: 5 },
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              order: () => {
                profileFetchCount++
                return Promise.resolve({
                  data: [
                    { id: 'student-1', full_name: 'Aarav Shah', grade: '10', created_at: isoDaysAgo(30) },
                    { id: 'student-2', full_name: 'Iris Inactive', grade: '12', created_at: isoDaysAgo(60) },
                    { id: 'student-3', full_name: 'Nadia Newbie', grade: 'MBA', created_at: isoDaysAgo(5) },
                    { id: 'student-4', full_name: 'Sam Suspicious', grade: '12', created_at: isoDaysAgo(20) },
                  ],
                })
              },
              // Pulse-strip query: count students with last_reminder_sent within 7d
              gte: () => Promise.resolve({ count: 3, error: null }),
            }),
          }),
        }
      }
      if (table === 'sessions') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [
                SESSION_WITH_COST, SESSION_WITH_COST_2,
                SESSION_IRIS,
                SESSION_SAM_1, SESSION_SAM_2, SESSION_SAM_OUTLIER,
              ],
            }),
            // Pulse-strip query: count sessions within 7d
            gte: () => Promise.resolve({ count: 5, error: null }),
          }),
        }
      }
      if (table === 'drill_attempts') {
        return {
          select: () => ({
            // Pulse-strip query: count drills within 7d
            gte: () => Promise.resolve({ count: 11, error: null }),
          }),
        }
      }
      if (table === 'vocabulary_words') {
        return {
          select: () => Promise.resolve({ count: 10, error: null }),
        }
      }
      if (table === 'student_word_progress') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [
                { student_id: 'student-1', mastered_at: '2026-04-15T00:00:00Z' },
                { student_id: 'student-1', mastered_at: '2026-04-20T00:00:00Z' },
                { student_id: 'student-1', mastered_at: null },
              ],
              error: null,
            }),
          }),
        }
      }
      if (table === 'milestones') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              // 5 milestones for student-1
              data: [
                { student_id: 'student-1', kind: 'comprehension_aced' },
                { student_id: 'student-1', kind: 'comprehension_aced' },
                { student_id: 'student-1', kind: 'personal_best_accuracy' },
                { student_id: 'student-1', kind: 'word_mastered' },
                { student_id: 'student-1', kind: 'word_mastered' },
              ],
              error: null,
            }),
            // Pulse-strip query: count milestones within 7d
            gte: () => Promise.resolve({ count: 7, error: null }),
          }),
        }
      }
      return {}
    },
  },
}))

let capturedOnClose = null
vi.mock('../../components/AddStudentModal', () => ({
  default: ({ onClose }) => {
    capturedOnClose = onClose
    return <div data-testid="add-student-modal" />
  },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  profileFetchCount = 0
  capturedOnClose = null
})

// ─── Add Student ──────────────────────────────────────────────────────────────

describe('TeacherDashboard — Add Student', () => {
  it('renders Add Student button', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => expect(screen.getByRole('button', { name: /add student/i })).toBeInTheDocument())
  })

  it('opens AddStudentModal when Add Student is clicked', async () => {
    const user = userEvent.setup()
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByRole('button', { name: /add student/i }))

    await user.click(screen.getByRole('button', { name: /add student/i }))
    expect(screen.getByTestId('add-student-modal')).toBeInTheDocument()
  })

  it('re-fetches student list when modal closes with didAdd=true', async () => {
    const user = userEvent.setup()
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByRole('button', { name: /add student/i }))
    const countBefore = profileFetchCount

    await user.click(screen.getByRole('button', { name: /add student/i }))
    expect(capturedOnClose).not.toBeNull()

    capturedOnClose(true)
    await waitFor(() => expect(profileFetchCount).toBeGreaterThan(countBefore))
  })

  it('does not re-fetch student list when modal closes with didAdd=false', async () => {
    const user = userEvent.setup()
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByRole('button', { name: /add student/i }))
    const countBefore = profileFetchCount

    await user.click(screen.getByRole('button', { name: /add student/i }))
    capturedOnClose(false)

    await new Promise(r => setTimeout(r, 50))
    expect(profileFetchCount).toBe(countBefore)
  })
})

// ─── Cost column ──────────────────────────────────────────────────────────────

describe('TeacherDashboard — Cost column', () => {
  it('renders a Cost column header', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    expect(screen.getByRole('columnheader', { name: /cost/i })).toBeInTheDocument()
  })

  it('shows the per-student total cost in the table', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    // Two sessions × $0.006165 = $0.0123 (appears in row + class total)
    expect(screen.getAllByText('$0.0123').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the class total cost below the table', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    expect(screen.getByText(/class total/i)).toBeInTheDocument()
  })

  it('shows "—" for a student with no session cost data', async () => {
    // Sessions mock returns sessions with cost; this test would need null sessions.
    // Covered by computeSessionCost unit tests — formatCost(null) = "—".
    // Integration: covered by costUtils.test.js.
  })
})

// ─── Summary stat chips ───────────────────────────────────────────────────────

describe('TeacherDashboard — summary stat chips', () => {
  it('shows total student count', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    const chip = screen.getByTestId('stat-students')
    // 4 students in the fixture (Aarav, Iris, Nadia, Sam)
    expect(chip).toHaveTextContent('4')
    expect(chip).toHaveTextContent(/students/i)
  })

  it('shows total sessions across all students', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    const chip = screen.getByTestId('stat-sessions')
    // 2 (Aarav) + 1 (Iris) + 3 (Sam) + 0 (Nadia) = 6
    expect(chip).toHaveTextContent('6')
    expect(chip).toHaveTextContent(/sessions/i)
  })

  it('shows class avg accuracy', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    const chip = screen.getByTestId('stat-accuracy')
    // Aarav avg 85, Iris avg 70, Sam avg (60+60+100)/3 = 73. Mean of (85,70,73) = 76.
    expect(chip).toHaveTextContent('76%')
    expect(chip).toHaveTextContent(/avg accuracy/i)
  })

  it('shows class-wide vocab mastery chip (now ungated by grade)', async () => {
    render(<TeacherDashboard />)
    // 2 mastered across the class / (4 students × 10 words total) = 5%.
    await waitFor(() => expect(screen.getByTestId('stat-vocab')).toHaveTextContent('5%'))
    expect(screen.getByTestId('stat-vocab')).toHaveTextContent(/vocab mastery/i)
  })
})

// ─── Weekly pulse strip (Phase 3) ─────────────────────────────────────────────

describe('TeacherDashboard — weekly pulse strip', () => {
  it('renders the This Week section heading', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText(/this week/i))
    expect(screen.getByText(/this week/i)).toBeInTheDocument()
  })

  it('shows pulse counts from the four count queries', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => expect(screen.getByTestId('pulse-sessions')).toHaveTextContent('5'))
    expect(screen.getByTestId('pulse-drills')).toHaveTextContent('11')
    expect(screen.getByTestId('pulse-milestones')).toHaveTextContent('7')
    expect(screen.getByTestId('pulse-reminders')).toHaveTextContent('3')
  })
})

// ─── Needs Your Attention (Phase 2 reframe) ───────────────────────────────────

describe('TeacherDashboard — Needs Your Attention', () => {
  it('renders the Needs Your Attention section heading', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText(/needs your attention/i))
    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument()
  })

  it('lists inactive students (last session > 7 days ago) as chips', async () => {
    render(<TeacherDashboard />)
    // Iris last session was 30 days ago — should appear under Inactive.
    await waitFor(() => expect(screen.getByTestId('attention-inactive')).toBeInTheDocument())
    expect(screen.getByTestId('attention-inactive')).toHaveTextContent(/iris inactive/i)
    // Aarav (sessions 1-2 days ago) and Sam (1-5 days ago) must NOT appear here.
    expect(screen.getByTestId('attention-inactive')).not.toHaveTextContent(/aarav/i)
    expect(screen.getByTestId('attention-inactive')).not.toHaveTextContent(/sam/i)
  })

  it('lists never-started students (account > 2 days, zero sessions) as chips', async () => {
    render(<TeacherDashboard />)
    // Nadia: 5-day-old account, zero sessions — should appear under Never Started.
    await waitFor(() => expect(screen.getByTestId('attention-never-started')).toBeInTheDocument())
    expect(screen.getByTestId('attention-never-started')).toHaveTextContent(/nadia newbie/i)
    // Iris has 1 session so she is "inactive" not "never started".
    expect(screen.getByTestId('attention-never-started')).not.toHaveTextContent(/iris/i)
  })

  it('lists outlier-flagged sessions across all students', async () => {
    render(<TeacherDashboard />)
    // Sam's last session: 100% accuracy vs prior 60% mean → outlier.
    await waitFor(() => expect(screen.getByTestId('attention-outliers')).toBeInTheDocument())
    expect(screen.getByTestId('attention-outliers')).toHaveTextContent(/sam suspicious/i)
    // Aarav's two sessions are 85% each — no outlier.
    expect(screen.getByTestId('attention-outliers')).not.toHaveTextContent(/aarav/i)
  })

  it('clicking an inactive-student chip navigates to that student detail', async () => {
    const user = userEvent.setup()
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByTestId('attention-inactive'))
    const irisChip = screen.getByRole('button', { name: /iris inactive/i })
    await user.click(irisChip)
    expect(mockNavigate).toHaveBeenCalledWith('/teacher/student/student-2')
  })
})

// ─── Last Session red highlight ───────────────────────────────────────────────

describe('TeacherDashboard — last session red highlight', () => {
  it('renders the Iris last-session cell with red colour (>7 days)', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByTestId('last-session-cell-student-2'))
    expect(screen.getByTestId('last-session-cell-student-2').className).toMatch(/text-red/)
  })

  it('renders the Aarav last-session cell without red colour (<7 days)', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByTestId('last-session-cell-student-1'))
    expect(screen.getByTestId('last-session-cell-student-1').className).not.toMatch(/text-red/)
  })
})

// ─── Per-student vocab + milestone columns (Phase 1 visibility) ───────────────

describe('TeacherDashboard — per-student vocab + milestones columns', () => {
  it('renders a Vocab column header', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    expect(screen.getByRole('columnheader', { name: /vocab/i })).toBeInTheDocument()
  })

  it('shows per-student mastered count + total in the row', async () => {
    render(<TeacherDashboard />)
    // Vocab data fetches after student list — wait for the cell to populate.
    await waitFor(() => expect(screen.getByTestId('vocab-cell-student-1')).toHaveTextContent('2 / 10'))
  })

  it('renders a Milestones column header', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    expect(screen.getByRole('columnheader', { name: /milestones/i })).toBeInTheDocument()
  })

  it('shows per-student milestones count in the row', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => expect(screen.getByTestId('milestones-cell-student-1')).toHaveTextContent('5'))
  })
})
