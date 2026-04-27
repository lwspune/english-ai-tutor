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

// Track how many times profiles is queried so we can detect refetches
let profileFetchCount = 0

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
            in: () => Promise.resolve({ data: [] }),
          }),
        }
      }
      return {}
    },
  },
}))

// Stub AddStudentModal so we can control its onClose callback
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

    // Give React a tick to potentially trigger effects
    await new Promise(r => setTimeout(r, 50))
    expect(profileFetchCount).toBe(countBefore)
  })
})
