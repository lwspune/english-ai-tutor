import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PassageManager from './PassageManager'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'teacher-1' } }),
}))

vi.mock('../../components/QuestionPanel', () => ({
  default: () => null,
}))

const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'passages') {
        return {
          select: () => ({ order: () => Promise.resolve({ data: [] }) }),
          insert: (payload) => {
            mockInsert(payload)
            return Promise.resolve({ data: null, error: null })
          },
          delete: () => ({ eq: () => Promise.resolve({}) }),
        }
      }
      return {}
    },
  },
}))

describe('PassageManager — difficulty', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockNavigate.mockReset()
  })

  it('includes difficulty in the insert payload when saving a new passage', async () => {
    const user = userEvent.setup()
    render(<PassageManager />)

    await user.click(screen.getByRole('button', { name: /\+ add passage/i }))

    await user.type(screen.getByPlaceholderText(/the gift of the magi/i), 'Test Title')
    await user.type(screen.getByPlaceholderText(/paste passage text/i), 'Some passage content here.')
    await user.selectOptions(screen.getByLabelText(/difficulty/i), 'moderate')

    await user.click(screen.getByRole('button', { name: /save passage/i }))

    await waitFor(() => expect(mockInsert).toHaveBeenCalled())
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 'moderate' })
    )
  })

  it('defaults difficulty to easy', async () => {
    const user = userEvent.setup()
    render(<PassageManager />)

    await user.click(screen.getByRole('button', { name: /\+ add passage/i }))

    const select = screen.getByLabelText(/difficulty/i)
    expect(select).toHaveValue('easy')
  })
})
