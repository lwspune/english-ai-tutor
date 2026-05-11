import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from './BottomNav'

const { mockProfile } = vi.hoisted(() => ({ mockProfile: { value: { id: 's1', grade: '11' } } }))

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile.value }),
}))

function renderAt(path, grade = '11') {
  mockProfile.value = { id: 's1', grade }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>
  )
}

describe('BottomNav', () => {
  it('renders Home and Progress tabs', () => {
    renderAt('/student')
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /progress/i })).toBeInTheDocument()
  })

  it('Home tab links to /student', () => {
    renderAt('/student')
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/student')
  })

  it('Progress tab links to /student/progress', () => {
    renderAt('/student')
    expect(screen.getByRole('link', { name: /progress/i })).toHaveAttribute('href', '/student/progress')
  })

  it('marks Home as current on /student', () => {
    renderAt('/student')
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /progress/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Progress as current on /student/progress', () => {
    renderAt('/student/progress')
    expect(screen.getByRole('link', { name: /progress/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('shows Vocab tab for grade 11 students', () => {
    renderAt('/student', '11')
    expect(screen.getByRole('link', { name: /vocab/i })).toHaveAttribute('href', '/student/vocab')
  })

  it('shows Vocab tab for grade 12 students', () => {
    renderAt('/student', '12')
    expect(screen.getByRole('link', { name: /vocab/i })).toBeInTheDocument()
  })

  it('shows Vocab tab for MBA students', () => {
    renderAt('/student', 'MBA')
    expect(screen.getByRole('link', { name: /vocab/i })).toBeInTheDocument()
  })

  it('hides Vocab tab for grade 9 students', () => {
    renderAt('/student', '9')
    expect(screen.queryByRole('link', { name: /vocab/i })).not.toBeInTheDocument()
  })

  it('hides Vocab tab for grade 10 students', () => {
    renderAt('/student', '10')
    expect(screen.queryByRole('link', { name: /vocab/i })).not.toBeInTheDocument()
  })

  it('marks Vocab as current on /student/vocab', () => {
    renderAt('/student/vocab', '11')
    expect(screen.getByRole('link', { name: /vocab/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Vocab as current on /student/vocab/practice', () => {
    renderAt('/student/vocab/practice', '12')
    expect(screen.getByRole('link', { name: /vocab/i })).toHaveAttribute('aria-current', 'page')
  })
})
