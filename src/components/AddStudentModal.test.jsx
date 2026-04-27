import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddStudentModal from './AddStudentModal'

const mockInvoke = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
  },
}))

const onClose = vi.fn()

function renderModal() {
  return render(<AddStudentModal onClose={onClose} />)
}

beforeEach(() => {
  mockInvoke.mockReset()
  onClose.mockReset()
})

// ─── Single tab ────────────────────────────────────────────────────────────────

describe('AddStudentModal — Single tab', () => {
  it('renders all form fields', () => {
    renderModal()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText(/grade/i)).toBeInTheDocument()
  })

  it('calls create-student with correct payload on submit', async () => {
    mockInvoke.mockResolvedValue({
      data: { results: [{ email: 'aarav@test.com', success: true }] },
      error: null,
    })
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText(/full name/i), 'Aarav Shah')
    await user.type(screen.getByLabelText(/email/i), 'aarav@test.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.selectOptions(screen.getByLabelText(/grade/i), '10')
    await user.click(screen.getByRole('button', { name: /add student/i }))

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('create-student', {
        body: {
          students: [{ full_name: 'Aarav Shah', email: 'aarav@test.com', password: 'secret123', grade: '10' }],
        },
      })
    )
  })

  it('shows success message and calls onClose with didAdd=true', async () => {
    mockInvoke.mockResolvedValue({
      data: { results: [{ email: 'aarav@test.com', success: true }] },
      error: null,
    })
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText(/full name/i), 'Aarav Shah')
    await user.type(screen.getByLabelText(/email/i), 'aarav@test.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.selectOptions(screen.getByLabelText(/grade/i), '10')
    await user.click(screen.getByRole('button', { name: /add student/i }))

    await waitFor(() => expect(screen.getByText(/student added/i)).toBeInTheDocument())
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('shows inline error when edge function returns an error', async () => {
    mockInvoke.mockResolvedValue({
      data: { results: [{ email: 'aarav@test.com', success: false, error: 'Email already registered' }] },
      error: null,
    })
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText(/full name/i), 'Aarav Shah')
    await user.type(screen.getByLabelText(/email/i), 'aarav@test.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.selectOptions(screen.getByLabelText(/grade/i), '10')
    await user.click(screen.getByRole('button', { name: /add student/i }))

    await waitFor(() => expect(screen.getByText(/email already registered/i)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows error when invoke itself fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Network error' } })
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText(/full name/i), 'Aarav Shah')
    await user.type(screen.getByLabelText(/email/i), 'aarav@test.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.selectOptions(screen.getByLabelText(/grade/i), '10')
    await user.click(screen.getByRole('button', { name: /add student/i }))

    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument())
  })

  it('closes without didAdd when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledWith(false)
  })
})

// ─── CSV tab ──────────────────────────────────────────────────────────────────

describe('AddStudentModal — CSV tab', () => {
  async function switchToCsv() {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('tab', { name: /import csv/i }))
    return user
  }

  function makeCsvFile(content) {
    return new File([content], 'students.csv', { type: 'text/csv' })
  }

  it('shows file input on CSV tab', async () => {
    await switchToCsv()
    expect(screen.getByLabelText(/upload csv/i)).toBeInTheDocument()
  })

  it('shows preview table with valid rows', async () => {
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nAarav Shah,aarav@test.com,secret123,10\nPriya Patel,priya@test.com,mypass99,MBA'
    const file = makeCsvFile(csv)

    const input = screen.getByLabelText(/upload csv/i)
    await user.upload(input, file)

    await waitFor(() => expect(screen.getByText('Aarav Shah')).toBeInTheDocument())
    expect(screen.getByText('Priya Patel')).toBeInTheDocument()
  })

  it('marks rows with invalid email as invalid', async () => {
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nBad Student,not-an-email,secret123,9'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => expect(screen.getByText('Bad Student')).toBeInTheDocument())
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
  })

  it('marks rows with short password as invalid', async () => {
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nBad Student,bad@test.com,short,9'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => expect(screen.getByText('Bad Student')).toBeInTheDocument())
    expect(screen.getByText(/password min 8/i)).toBeInTheDocument()
  })

  it('marks rows with invalid grade as invalid', async () => {
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nBad Student,bad@test.com,secret123,13'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => expect(screen.getByText('Bad Student')).toBeInTheDocument())
    expect(screen.getByText(/invalid grade/i)).toBeInTheDocument()
  })

  it('disables Import button when no valid rows', async () => {
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nBad Student,not-an-email,short,13'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => expect(screen.getByText('Bad Student')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /import/i })).toBeDisabled()
  })

  it('enables Import button when at least one valid row', async () => {
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nAarav Shah,aarav@test.com,secret123,10'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => expect(screen.getByText('Aarav Shah')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /import 1/i })).not.toBeDisabled()
  })

  it('shows post-import summary with created/failed counts', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        results: [
          { email: 'aarav@test.com', success: true },
          { email: 'priya@test.com', success: false, error: 'Email already registered' },
        ],
      },
      error: null,
    })
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nAarav Shah,aarav@test.com,secret123,10\nPriya Patel,priya@test.com,secret456,MBA'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => screen.getByRole('button', { name: /import 2/i }))
    await user.click(screen.getByRole('button', { name: /import 2/i }))

    await waitFor(() => expect(screen.getByText(/1 created/i)).toBeInTheDocument())
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument()
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('does not call onClose when all rows failed', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        results: [{ email: 'aarav@test.com', success: false, error: 'Email already registered' }],
      },
      error: null,
    })
    const user = await switchToCsv()
    const csv = 'full_name,email,password,grade\nAarav Shah,aarav@test.com,secret123,10'
    await user.upload(screen.getByLabelText(/upload csv/i), makeCsvFile(csv))

    await waitFor(() => screen.getByRole('button', { name: /import 1/i }))
    await user.click(screen.getByRole('button', { name: /import 1/i }))

    await waitFor(() => expect(screen.getByText(/0 created/i)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
