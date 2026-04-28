import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Pagination, { PAGE_SIZE } from './Pagination'

describe('Pagination', () => {
  it('renders nothing when total is at or below one page', () => {
    const { container } = render(
      <Pagination page={0} total={PAGE_SIZE} onPrev={vi.fn()} onNext={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(
      <Pagination page={0} total={0} onPrev={vi.fn()} onNext={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders controls when total exceeds one page', () => {
    render(<Pagination page={0} total={6} onPrev={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('Previous button is disabled on the first page', () => {
    render(<Pagination page={0} total={12} onPrev={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('Next button is disabled on the last page', () => {
    render(<Pagination page={1} total={10} onPrev={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('shows correct page indicator', () => {
    render(<Pagination page={1} total={12} onPrev={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('calls onPrev when Previous is clicked', () => {
    const onPrev = vi.fn()
    render(<Pagination page={1} total={12} onPrev={onPrev} onNext={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn()
    render(<Pagination page={0} total={12} onPrev={vi.fn()} onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('applies testIdPrefix to page indicator and next button', () => {
    render(
      <Pagination page={0} total={12} onPrev={vi.fn()} onNext={vi.fn()} testIdPrefix="sessions" />
    )
    expect(screen.getByTestId('sessions-page-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('sessions-next')).toBeInTheDocument()
  })

  it('exports PAGE_SIZE as 5', () => {
    expect(PAGE_SIZE).toBe(5)
  })
})
