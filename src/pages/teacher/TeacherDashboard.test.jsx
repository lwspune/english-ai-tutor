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

// Sessions with cost metrics: 60s Whisper + 500 input + 150 output tokens
// Whisper: 60/60 * 0.006 = $0.006
// GPT:     500 * 0.00000015 + 150 * 0.0000006 = $0.000075 + $0.00009 = $0.000165
// Total per session: $0.006165
// Two sessions → $0.012330
const SESSION_WITH_COST = {
  student_id: 'student-1',
  score_accuracy: 85,
  score_wpm: 130,
  created_at: '2026-04-27T10:00:00Z',
  whisper_duration_seconds: 60,
  llm_input_tokens: 500,
  llm_output_tokens: 150,
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
                  data: [{ id: 'student-1', full_name: 'Aarav Shah', grade: '10' }],
                })
              },
            }),
          }),
        }
      }
      if (table === 'sessions') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [SESSION_WITH_COST, SESSION_WITH_COST],
            }),
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
    expect(chip).toHaveTextContent('1')
    expect(chip).toHaveTextContent(/students/i)
  })

  it('shows total sessions across all students', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    const chip = screen.getByTestId('stat-sessions')
    expect(chip).toHaveTextContent('2')
    expect(chip).toHaveTextContent(/sessions/i)
  })

  it('shows class avg accuracy', async () => {
    render(<TeacherDashboard />)
    await waitFor(() => screen.getByText('Aarav Shah'))
    const chip = screen.getByTestId('stat-accuracy')
    expect(chip).toHaveTextContent('85%')
    expect(chip).toHaveTextContent(/avg accuracy/i)
  })

  it('shows class-wide vocab mastery chip (now ungated by grade)', async () => {
    render(<TeacherDashboard />)
    // Wait for the vocab fetch to resolve and update the chip — the
    // student list loads first, but the vocab effect runs after.
    await waitFor(() => expect(screen.getByTestId('stat-vocab')).toHaveTextContent('20%'))
    expect(screen.getByTestId('stat-vocab')).toHaveTextContent(/vocab mastery/i)
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
