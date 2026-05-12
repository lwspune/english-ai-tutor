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

const { mockInsert, insertResponse } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  insertResponse: { current: { data: null, error: null } },
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'passages') {
        return {
          select: () => ({ order: () => Promise.resolve({ data: [] }) }),
          insert: (payload) => {
            mockInsert(payload)
            return Promise.resolve(insertResponse.current)
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
    insertResponse.current = { data: null, error: null }
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

describe('PassageManager — MBA grade level', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockNavigate.mockReset()
    insertResponse.current = { data: null, error: null }
  })

  it('shows MBA as a grade level option', async () => {
    const user = userEvent.setup()
    render(<PassageManager />)

    await user.click(screen.getByRole('button', { name: /\+ add passage/i }))

    const gradeSelect = screen.getByLabelText(/grade level/i)
    const options = Array.from(gradeSelect.options).map(o => o.text)
    expect(options).toContain('MBA')
  })

  it('saves MBA grade_level as the string "MBA" (not NaN)', async () => {
    const user = userEvent.setup()
    render(<PassageManager />)

    await user.click(screen.getByRole('button', { name: /\+ add passage/i }))

    await user.type(screen.getByPlaceholderText(/the gift of the magi/i), 'MBA Passage')
    await user.type(screen.getByPlaceholderText(/paste passage text/i), 'Some content for MBA students.')
    await user.selectOptions(screen.getByLabelText(/grade level/i), 'MBA')

    await user.click(screen.getByRole('button', { name: /save passage/i }))

    await waitFor(() => expect(mockInsert).toHaveBeenCalled())
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ grade_level: 'MBA' })
    )
  })
})

describe('PassageManager — error surfacing (Finding 12)', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockNavigate.mockReset()
    insertResponse.current = { data: null, error: null }
  })

  it('shows an error banner and keeps the form open when insert fails', async () => {
    const user = userEvent.setup()
    insertResponse.current = { data: null, error: { message: 'duplicate title' } }
    render(<PassageManager />)
    await user.click(screen.getByRole('button', { name: /\+ add passage/i }))
    await user.type(screen.getByPlaceholderText(/the gift of the magi/i), 'Test')
    await user.type(screen.getByPlaceholderText(/paste passage text/i), 'Some content.')
    await user.click(screen.getByRole('button', { name: /save passage/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // Form should remain open since the save failed
    expect(screen.getByRole('button', { name: /save passage/i })).toBeInTheDocument()
  })
})
