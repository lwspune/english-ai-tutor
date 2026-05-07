import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from './BottomNav'

function renderAt(path) {
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
})
